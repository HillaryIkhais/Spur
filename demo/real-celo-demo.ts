// demo/real-celo-demo.ts — MELD against REAL Celo state.
//
// The decisive numbers (actual fill, impact) are OBSERVED FROM CELO.
// Nothing the agent or the quote claims can change them.
//
//   mainnet via Forno (42220) → pool USDm/USDC 0x0️⃣2f4… → real swap tx observed.
//
// Acceptance test: delete the simulator and re-run — this still works, because
// the fill layer is `providers/celo.ts`, not `routing.ts`.
import { verifyMessage } from "viem";
import type { PaymentIntent, PaymentPolicy } from "../meld/types.js";
import { executeLive } from "../meld/live.js";
import { makeClients, REF_SWAP_MAINNET } from "../providers/celo.js";

const NET = "mainnet" as const;
const { pair, txHash } = REF_SWAP_MAINNET;
const TOKEN_IN = pair.token1.address; // USDC — AI treasury
const TOKEN_OUT = pair.token0.address; // USDm — merchant requirement
const MERCHANT = "0xCeD0a1f2aBc3d4eF567890aBcDef123456789abc" as `0x${string}`;

const req = (amount: string, asset: `0x${string}`) => ({
  x402Version: 1,
  accepts: [
    {
      scheme: "exact",
      asset,
      amount,
      network: "celo",
      maxTimeoutSeconds: 300,
      payTo: MERCHANT,
    },
  ],
  resource: "https://merchant.example/quote",
  spec: {},
});

const intentWith = (amount: string, policy: PaymentPolicy, treasury: Record<string, string>): PaymentIntent => ({
  requirement: req(amount, TOKEN_OUT),
  policy,
  treasury,
});

const makePolicy = (maxSlippageBps: number, maxTotalCostUsd: number): PaymentPolicy => ({
  maxSlippageBps,
  maxTotalCostUsd,
  expirySec: 600,
  maxRouteHops: 2,
});

const status = (r: { success: boolean }) => (r.success ? "ALLOWED" : "BLOCKED");

async function main() {
  console.log("MELD — REAL Celo observation loop");
  console.log("-".repeat(62));
  const clients = makeClients(NET);
  console.log(`chain:  ${clients.net.toUpperCase()} (${clients.chainId})`);
  console.log(`pair:   ${pair.name} @ ${pair.address}`);
  console.log(`seed:   ${txHash}`);
  console.log(`exporer: ${`https://celoscan.io/tx/`}${txHash}`);
  console.log();

  // Run the reference swap through the OBSERVER to get true chain actuals.
  const r0 = await executeLive(intentWith("0.01", makePolicy(500, 1), { USDC: "1.0" }), {
    net: NET,
    pair: pair.address,
    tokenIn: TOKEN_IN,
    tokenOut: TOKEN_OUT,
    fill: { kind: "replay", txHash, pair: pair.address },
    merchant: MERCHANT,
  });
  const observed = r0.observed!;
  const actual = parseFloat(observed.actualOutput);

  console.log("CHAIN OBSERVED FILL (transaction " + observed.txHash.slice(0, 14) + "…)");
  console.log(`  block        ${observed.blockNumber.toString()}`);
  console.log(`  input paid   ${observed.actualInput} ${observed.tokenIn.symbol}`);
  console.log(`  output got   ${observed.actualOutput} ${observed.tokenOut.symbol}`);
  console.log(`  chain quote  ${observed.quoteOutput} ${observed.tokenOut.symbol} (for that input)`);
  console.log(`  impact       ${observed.impactPct.toFixed(4)}%`);
  console.log();

  // ---- HAPPY PATH — quoted ≈ required, fill within tolerance → ALLOW ----
  const requiredHappy = actual.toFixed(6);
  console.log("[1] QUOTE   agent quoted " + requiredHappy + " " + observed.tokenOut.symbol);
  console.log("[2] EXECUTE on Celo            … real swap tx " + txHash.slice(0, 16));
  console.log("[3] OBSERVE fill from Celo     … got " + observed.actualOutput + " " + observed.tokenOut.symbol);
  const happy = await executeLive(
    intentWith(requiredHappy, makePolicy(500, 1), { USDC: "12.41" }),
    {
      net: NET,
      pair: pair.address,
      tokenIn: TOKEN_IN,
      tokenOut: TOKEN_OUT,
      fill: { kind: "replay", txHash, pair: pair.address },
      merchant: MERCHANT,
    },
  );
  console.log(`[4] DECISION ${status(happy)}   (impact ${observed.impactPct.toFixed(2)}% ≤ 5%)`);
  for (const c of happy.checks) console.log(`    ${c.pass ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  console.log("    receipt " + happy.receipt!.receiptHash.slice(0, 16) + "… signer 0x" + happy.receipt!.signer.slice(2, 10));
  const okSig = await verifyMessage({
    address: happy.receipt!.signer,
    message: { raw: happy.receipt!.receiptHash },
    signature: happy.receipt!.signature,
  });
  console.log("    signature verified by viem: " + okSig);
  console.log();

  // ---- KILL SHOT — agent over-claims; chain disagrees; BLOCK. ----
  // The executor/quote sees the merchant's demand but the pool actually delivers
  // less. Nobody can flip the observed number to save the payment.
  const claimed = (actual * 1.022).toFixed(6); // +2.2% over what the chain did
  const killPolicy = makePolicy(100, 1); // cap 1%
  console.log("KILL-SHOT — executor claims MORE than the chain will deliver");
  console.log(`[1] QUOTE   agent quoted ${claimed} ${observed.tokenOut.symbol}`);
  console.log("[2] EXECUTE on Celo            … real swap tx " + txHash.slice(0, 16));
  const kill = await executeLive(
    intentWith(claimed, killPolicy, { USDC: "12.41" }),
    {
      net: NET,
      pair: pair.address,
      tokenIn: TOKEN_IN,
      tokenOut: TOKEN_OUT,
      fill: { kind: "replay", txHash, pair: pair.address },
      merchant: MERCHANT,
    },
  );
  console.log(`[3] OBSERVE fill from Celo     … got ${observed.actualOutput} ${observed.tokenOut.symbol}`);
  console.log(`[4] RE-COMPUTE impact          … ${observed.impactPct.toFixed(4)}% vs quoted`);
  console.log(`[5] DECISION ${status(kill)}    — policy cap 1%`);
  for (const c of kill.checks) console.log(`    ${c.pass ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  console.log("    receipt " + kill.receipt!.receiptHash.slice(0, 16) + "… signer 0x" + kill.receipt!.signer.slice(2, 10));
  const badSig = await verifyMessage({
    address: kill.receipt!.signer,
    message: { raw: kill.receipt!.receiptHash },
    signature: kill.receipt!.signature,
  });
  console.log("    signature verified by viem: " + badSig);
  console.log();
  console.log("Invariant: the decisive number is observed from Celo, not supplied by any party.");
  console.log(`Mock-audit: ${happy.success && !kill.success ? "ALLOW/BLOCK both correct" : "CONTRADICTION — fix"} — verdict ${kill.success ? "VIOLATION (should be BLOCKED)" : "CORRECTLY BLOCKED"}`);
}

main().catch((e) => {
  console.error("live demo error:", e.message);
  process.exit(1);
});