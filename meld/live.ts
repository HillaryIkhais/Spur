// meld/live.ts — MELD on real Celo.
// Ordering is the product: INTENT → QUOTE → PRECHECK → OBSERVE CHAIN →
//   DERIVE FILL → RE-COMPUTE IMPACT → ENFORCE → ALLOW/BLOCK → SIGNED RECEIPT.
// The actual fill is read from chain state/events, never from the executor.
import { keccak256, toHex, type Account, type Hex, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { PaymentIntent, RouteQuote } from "./types.js";
import { enforcePolicy, policyPasses, type PolicyCheck } from "./policy.js";
import {
  makeClients,
  observeSwapFill,
  approveAndSwap,
  getReserves,
  quoteV2,
  toHuman,
  resolveTokenMeta,
  canonical,
  type CeloClients,
  type CeloNet,
  type ObservedFill,
  type SignedReceipt,
} from "../providers/celo.js";

export type FillSource =
  | { kind: "replay"; txHash: Hex; pair: Address } // mined tx, chain-observed
  | { kind: "broadcast"; pair: Address; amountInRaw: bigint }; // funded key required

export interface LiveOptions {
  net?: CeloNet;
  pair: Address;
  tokenIn: Address;
  tokenOut: Address;
  fill: FillSource;
  // Optional divergence for the kill-shot demo: what the routing layer CLAIMED.
  // When unset, the claim is derived from the chain quote itself.
  quotedOutputOverride?: string;
  merchant: Address;
}

export interface LiveResult {
  success: boolean;
  reason: string;
  quote: RouteQuote | null;
  checks: PolicyCheck[];
  observed: ObservedFill | null;
  receipt: SignedReceipt | null;
  clients: CeloClients;
}

const padPrecise = (s: string, precision = 6) =>
  Number(s).toFixed(precision).replace(/0+$/, "").replace(/\.$/, "");

export async function executeLive(intent: PaymentIntent, opts: LiveOptions): Promise<LiveResult> {
  const clients = makeClients(opts.net ?? "mainnet");
  const { publicClient } = clients;
  const nowSec = Math.floor(Date.now() / 1000);

  // 1. On-chain quote from live pool reserves (not the static table).
  const { token0, reserve0, reserve1 } = await getReserves(publicClient, opts.pair);
  const tokenInIsToken0 = token0.toLowerCase() === opts.tokenIn.toLowerCase();
  if (
    token0.toLowerCase() !== opts.tokenIn.toLowerCase() &&
    token0.toLowerCase() !== opts.tokenOut.toLowerCase()
  ) {
    return { success: false, reason: `pool ${opts.pair} does not hold the required tokens`, quote: null, checks: [], observed: null, receipt: null, clients };
  }
  const [inInfo, outInfo] = await Promise.all([
    resolveTokenMeta(publicClient, opts.tokenIn),
    resolveTokenMeta(publicClient, opts.tokenOut),
  ]);

  const required = parseFloat(intent.requirement.accepts[0]?.amount ?? "0");
  // Invert the k-curve so `required` output is met by `inputNeeded`.
  const rIn = tokenInIsToken0 ? reserve0 : reserve1;
  const rOut = tokenInIsToken0 ? reserve1 : reserve0;
  const requiredRaw = BigInt(Math.ceil(required * 10 ** outInfo.decimals));
  const inputForRequired = requiredRaw > 0n
    ? (requiredRaw * 1000n * rIn) / ((rOut - requiredRaw) * 997n) + 1n
    : 0n;
  const inputNeeded = toHuman(inputForRequired, inInfo.decimals);

  // 2. Execution on Celo, then chain observation of the actual fill.
  let observed: ObservedFill;
  if (opts.fill.kind === "replay") {
    observed = await observeSwapFill(publicClient, opts.pair, opts.fill.txHash, {
      tokenIn: opts.tokenIn,
      tokenOut: opts.tokenOut,
    });
  } else {
    // Broadcast path: approve → swap via V3 router → observe the resulting fill.
    if (!clients.walletClient || !clients.account) {
      return { success: false, reason: "broadcast requires AGENT_PRIVATE_KEY (funded)", quote: null, checks: [], observed: null, receipt: null, clients };
    }
    const recipient = clients.account.address;
    // amountOutMinimum = 0 for broadcast; policy enforcement happens AFTER observation.
    const swapTxHash = await approveAndSwap(
      clients,
      opts.tokenIn,
      opts.tokenOut,
      inputForRequired,
      0n, // no slippage protection at swap time — policy checks after observation
      recipient,
    );
    observed = await observeSwapFill(publicClient, opts.pair, swapTxHash, {
      tokenIn: opts.tokenIn,
      tokenOut: opts.tokenOut,
    });
  }

  // 3. Rebuild the quote with the OBSERVED outcome as actualOutput.
  const expectedOutput = opts.quotedOutputOverride ?? required.toFixed(6);
  const minOutput = (parseFloat(expectedOutput) * (1 - intent.policy.maxSlippageBps / 10000)).toFixed(6);
  const quote: RouteQuote = {
    inputToken: { symbol: inInfo.symbol, address: opts.tokenIn, decimals: inInfo.decimals },
    outputToken: { symbol: outInfo.symbol, address: opts.tokenOut, decimals: outInfo.decimals },
    inputAmount: padPrecise(observed.actualInput),
    expectedOutput: padPrecise(expectedOutput),
    actualOutput: padPrecise(observed.actualOutput),
    minOutput,
    priceImpactPct: observed.impactPct,
    route: observed.route,
    estimatedGasUsd: 0.0001,
  };

  // 4. Policy decision happens AFTER observation. Always.
  const checks = enforcePolicy(intent, quote, nowSec);
  const success = policyPasses(checks);
  const failed = checks.filter((c) => !c.pass).map((c) => c.name).join(", ");

  // 5. Signed receipt binding tx + observed outcome + decision.
  const receiptPayload: Record<string, unknown> = {
    protocol: "meld-live",
    net: clients.net,
    chainId: clients.chainId,
    pair: opts.pair,
    txHash: observed.txHash,
    block: Number(observed.blockNumber),
    merchant: opts.merchant,
    required: intent.requirement.accepts[0]?.amount,
    quotedOutput: expectedOutput,
    observed: {
      input: `${observed.actualInput} ${observed.tokenIn.symbol}`,
      output: `${observed.actualOutput} ${observed.tokenOut.symbol}`,
      chainQuoteOutput: observed.quoteOutput,
      impactPct: Number(observed.impactPct.toFixed(4)),
      feePct: observed.feePct,
    },
    decision: success ? "ALLOW" : "BLOCK",
    failedChecks: failed,
  };
  const account: Account = clients.account ?? privateKeyToAccount(generatePrivateKey());
  type SignFn = (p: { message: { raw: Hex } }) => Promise<Hex>;
  const sign = ((account.signMessage ?? (() => { throw new Error("no signer available"); })).bind(account) as SignFn);
  const sig = await sign({ message: { raw: keccak256(toHex(canonical(receiptPayload))) } });
  const receipt: SignedReceipt = {
    receiptHash: keccak256(toHex(canonical(receiptPayload))),
    signer: account.address as Address,
    signature: sig,
    payload: receiptPayload,
  };

  return {
    success,
    reason: success
      ? `PAID — observed validate vs quoted; impact ${observed.impactPct.toFixed(2)}% within bound`
      : `BLOCKED — observed fill violates policy: ${failed}`,
    quote,
    checks,
    observed,
    receipt,
    clients,
  };
}