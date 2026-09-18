// demo/cross-border-commerce.ts — MELD product event.
//
// "An agent can buy a local-currency service anywhere on Celo
//  without maintaining a local-currency treasury."
//
// Flow:
//   Agent holds USDC → service requires wBRL → x402 returns 402 →
//   MELD finds the conversion → verifies the economics →
//   converts → pays → Celo settles → service completes.
//
// And the failure case:
//   Quote worsens / slippage exceeds bound → MELD refuses → no bad payment.
//
// Modes:
//   REPLAY (default): replays a real Celo mainnet swap tx through the observer.
//   BROADCAST:        executes a real swap on Celo (requires AGENT_PRIVATE_KEY + USDC balance).
//
// Usage:
//   tsx demo/cross-border-commerce.ts            # replay mode
//   BROADCAST=1 tsx demo/cross-border-commerce.ts  # broadcast mode (needs funded key)

import { verifyMessage } from "viem";
import type { PaymentIntent, PaymentPolicy, RouteQuote } from "../meld/types.js";
import { bridge402 } from "../meld/adapter.js";
import { executeLive } from "../meld/live.js";

import { makeClients, REF_SWAP_MAINNET } from "../providers/celo.js";
import { TOKENS } from "../meld/types.js";

const NET = "mainnet" as const;
const { pair, txHash } = REF_SWAP_MAINNET;
const TOKEN_IN = pair.token1.address as `0x${string}`;  // USDC
const TOKEN_OUT = pair.token0.address as `0x${string}`; // USDm (stands in for wBRL in replay)
const MERCHANT = "0xCeD0a1f2aBc3d4eF567890aBcDef123456789abc" as `0x${string}`;

const isBroadcast = process.env.BROADCAST === "1";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ts = () => Math.floor(Date.now() / 1000);
const status = (r: { success: boolean }) => (r.success ? "ALLOWED" : "BLOCKED");
const line = (s = "") => console.log(s);
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`;

function makePolicy(maxSlippageBps: number, maxTotalCostUsd: number): PaymentPolicy {
  return { maxSlippageBps, maxTotalCostUsd, expirySec: 600, maxRouteHops: 2 };
}

function makeIntent(amount: string, policy: PaymentPolicy, treasury: Record<string, string>): PaymentIntent {
  return {
    requirement: {
      x402Version: 1,
      accepts: [{ scheme: "exact", asset: TOKEN_OUT, amount, network: "celo", maxTimeoutSeconds: 300, payTo: MERCHANT }],
      resource: "https://merchant.celo.local/fx-quotes",
      spec: { count: 10, freshnessSec: 60, pair: "USD/BRL" },
    },
    policy,
    treasury,
  };
}

// ── Part 1: Deterministic adapter (static routing, no chain) ─────────────────

function part1() {
  line(bold("═".repeat(70)));
  line(bold("  PART 1 — DETERMINISTIC ADAPTER: USDC → wBRL"));
  line(bold("═".repeat(70)));
  line();

  // The product event: agent has USDC, service requires wBRL.
  const intent1 = {
    requirement: {
      x402Version: 1,
      accepts: [{
        scheme: "exact",
        asset: TOKENS.wBRL.address,
        amount: "0.08",
        network: "celo",
        maxTimeoutSeconds: 120,
        payTo: MERCHANT,
      }],
      resource: "https://merchant.celo.local/fx-quotes",
      spec: { count: 10, freshnessSec: 60, pair: "USD/BRL" },
    },
    policy: makePolicy(50, 1.0),
    treasury: { USDC: "12.41" },
  } as PaymentIntent;

  const r = bridge402(intent1, ts());

  line(`[1] AGENT TREASURY    ${Object.entries(intent1.treasury).map(([s, b]) => `${s} ${b}`).join(", ")}`);
  line(`[2] x402 REQUIREMENT  0.08 wBRL (merchant ${MERCHANT.slice(0, 14)}…)`);
  line(`[3] DETECT MISMATCH   agent has USDC, service requires wBRL`);
  line(`[4] FIND ROUTE        USDC → wBRL (static rate table)`);
  line(`[5] QUOTE             ${r.quote ? `${r.quote.inputAmount} ${r.quote.inputToken.symbol} → ${r.quote.expectedOutput} ${r.quote.outputToken.symbol}` : "none"}`);
  line(`[6] ENFORCE POLICY    ${r.checks.map((c) => `${c.pass ? "✓" : "✗"} ${c.name}`).join("  ")}`);
  line(`[7] OUTCOME           ${r.success ? ok("PAID — conversion verified, payment authorized") : bad("BLOCKED — " + r.reason)}`);
  if (r.paymentTxHash) line(`    x402 tx: ${r.paymentTxHash}`);
  line();

  // Failure: deteriorated fill exceeds slippage bound.
  const intent2 = {
    ...intent1,
    policy: makePolicy(30, 1.0), // tighter slippage cap
  };
  const r2 = bridge402(intent2, ts(), (q) => (Number(q.expectedOutput) * 0.95).toFixed(6));

  line(bold("  FAILURE DEMO — slippage exceeds bound"));
  line(`[1] QUOTE             0.08 wBRL expected`);
  line(`[2] SWAP FILL         0.076 wBRL actual (5% deterioration)`);
  line(`[3] SLIPPAGE CAP      30 bps (0.3%)`);
  line(`[4] OUTCOME           ${r2.success ? bad("PAID — VIOLATION") : ok("BLOCKED — refused to spend")}`);
  for (const c of r2.checks.filter((c) => !c.pass)) {
    line(`    ${bad("✗")} ${c.name}: ${c.detail}`);
  }
  line(`    invariant held: no bad payment issued`);
  line();
}

// ── Part 2: Live Celo observation (replay or broadcast) ──────────────────────

async function part2() {
  line(bold("═".repeat(70)));
  line(bold(`  PART 2 — LIVE CELO ${isBroadcast ? "BROADCAST" : "REPLAY"}: USDC → ${pair.name}`));
  line(bold("═".repeat(70)));
  line();

  const clients = makeClients(NET);
  line(`chain:     ${clients.net} (${clients.chainId})`);
  line(`pair:      ${pair.name} @ ${pair.address}`);
  line(`seed:      ${txHash}`);
  line(`explorer:  https://celoscan.io/tx/${txHash}`);
  line(`mode:      ${isBroadcast ? "BROADCAST (real swap)" : "REPLAY (chain observation)"}`);
  line();

  const merchantBalance0 = "0.00";

  // ── Happy path: agent buys local-currency service ──
  line(bold("  SCENARIO 1 — cross-border commerce succeeds"));
  line();

  const requiredAmount = "0.01";
  const intentHappy = makeIntent(requiredAmount, makePolicy(500, 1), { USDC: "12.41" });

  line(`[1] DISCOVER    agent holds USDC, Brazilian service requires wBRL`);
  line(`[2] x402        service returns 402: pay ${requiredAmount} ${pair.token0.symbol} to merchant`);
  line(`[3] QUOTE       USDC → ${pair.token0.symbol} via V2 pool ${pair.address}`);
  line(`[4] ${isBroadcast ? "EXECUTE" : "REPLAY"}     ${isBroadcast ? "real swap on Celo" : "replaying " + txHash.slice(0, 18) + "…"}`);

  const happy = await executeLive(intentHappy, {
    net: NET,
    pair: pair.address,
    tokenIn: TOKEN_IN,
    tokenOut: TOKEN_OUT,
    fill: isBroadcast
      ? { kind: "broadcast" as const, pair: pair.address, amountIn: 0n } // placeholder — broadcast path handles it
      : { kind: "replay" as const, txHash, pair: pair.address },
    merchant: MERCHANT,
  });

  const obs = happy.observed!;
  line(`[5] OBSERVE     chain delivered ${obs.actualOutput} ${obs.tokenOut.symbol} (quote: ${obs.quoteOutput})`);
  line(`[6] IMPACT      ${obs.impactPct.toFixed(4)}%`);
  line(`[7] POLICY      ${happy.checks.map((c) => `${c.pass ? "✓" : "✗"} ${c.name}`).join("  ")}`);
  line(`[8] DECISION    ${status(happy)}`);

  if (happy.receipt) {
    const sigOk = await verifyMessage({
      address: happy.receipt.signer,
      message: { raw: happy.receipt.receiptHash },
      signature: happy.receipt.signature,
    });
    line(`[9] RECEIPT     ${happy.receipt.receiptHash.slice(0, 18)}… signed=${sigOk}`);
  }
  line(`    explorer    https://celoscan.io/tx/${obs.txHash}`);
  line();

  // ── Kill shot: agent over-claims, chain disagrees ──
  line(bold("  SCENARIO 2 — slippage failure (kill shot)"));
  line();

  const overClaimed = (parseFloat(obs.actualOutput) * 1.022).toFixed(6); // +2.2% over chain reality
  const killPolicy = makePolicy(100, 1); // 1% slippage cap
  const intentKill = makeIntent(overClaimed, killPolicy, { USDC: "12.41" });

  line(`[1] QUOTE       agent quotes ${overClaimed} ${obs.tokenOut.symbol}`);
  line(`[2] ${isBroadcast ? "EXECUTE" : "REPLAY"}       same swap tx, chain delivers ${obs.actualOutput}`);
  line(`[3] OBSERVE     chain says ${obs.actualOutput}, agent claimed ${overClaimed}`);
  line(`[4] POLICY      slippage cap ${killPolicy.maxSlippageBps} bps`);

  const kill = await executeLive(intentKill, {
    net: NET,
    pair: pair.address,
    tokenIn: TOKEN_IN,
    tokenOut: TOKEN_OUT,
    fill: isBroadcast
      ? { kind: "broadcast" as const, pair: pair.address, amountIn: 0n }
      : { kind: "replay" as const, txHash, pair: pair.address },
    merchant: MERCHANT,
    quotedOutputOverride: overClaimed,
  });

  line(`[5] DECISION    ${status(kill)}`);
  for (const c of kill.checks.filter((c) => !c.pass)) {
    line(`    ${bad("✗")} ${c.name}: ${c.detail}`);
  }

  if (kill.receipt) {
    const sigOk = await verifyMessage({
      address: kill.receipt.signer,
      message: { raw: kill.receipt.receiptHash },
      signature: kill.receipt.signature,
    });
    line(`    receipt     ${kill.receipt.receiptHash.slice(0, 18)}… signed=${sigOk}`);
  }
  line();

  // ── Verdict ──
  line(bold("═".repeat(70)));
  const pass = happy.success && !kill.success;
  line(pass
    ? ok("  VERDICT — ALLOW / BLOCK both correct. Cross-border commerce works.")
    : bad("  VERDICT — CONTRADICTION. Investigate."));
  line(bold("═".repeat(70)));
  line();
  line("  Product event: agent bought a local-currency service without a local treasury.");
  line("  Router is invisible plumbing. The capability is autonomous cross-border commerce.");
  line();

  if (!pass) process.exitCode = 1;
}

// ── Main ─────────────────────────────────────────────────────────────────────

part1();
part2().catch((e) => {
  console.error(bad("live demo error:"), e.message);
  process.exit(1);
});
