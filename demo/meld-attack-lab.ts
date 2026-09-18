import { bridge402 } from "../meld/adapter.js";
import { intent, DEFAULT_POLICY } from "../meld/fixtures.js";
import { TOKENS, type PaymentIntent } from "../meld/types.js";

// MELD attack lab: named adversarial scenarios, all executed live.
// The deteriorated-fill attacks (A01) drive an `actualizeOverride` through
// the SAME post-swap settlement check the happy path uses.

let failures = 0;
let blocked = 0;
const ts = () => Math.floor(Date.now() / 1000);
const symOf = (i: PaymentIntent) =>
  Object.entries(TOKENS).find(([, t]) => t.address === i.requirement.accepts[0].asset)?.[0] ?? "?";

function attack(id: string, name: string, isBlocked: boolean, detail: string) {
  if (isBlocked) blocked++;
  else failures++;
  console.log(`${isBlocked ? "✅" : "❌"} ${id} ${name}: ${isBlocked ? "BLOCKED" : "NOT BLOCKED — VIOLATION"} — ${detail}`);
}

const checkDetail = (r: ReturnType<typeof bridge402>, name: string) =>
  r.checks.find((c) => c.name === name)?.detail ?? r.reason;

console.log("MELD — Attack Lab\n");

// A01 — deteriorated swap fill: quoted 0.08 wBRL, actual fill 0.0771.
const a01 = intent("wBRL", "0.08", { ...DEFAULT_POLICY, maxSlippageBps: 30 });
const r01 = bridge402(a01, ts(), (q) => "0.0771");
attack("A01", "deteriorated fill: 0.0771 wBRL < required 0.08", !r01.success,
  `actual 0.0771, required 0.08 — ${checkDetail(r01, "settleAmount")}`);

// A02 — quote held constant but actual dips below minOutput.
const a02 = intent("wBRL", "0.08", { ...DEFAULT_POLICY, maxSlippageBps: 50 });
const quoteAmt = 0.08;
const short = (0.08 * (1 - 60 / 10000)).toFixed(6); // 60bps off, over the 50bps cap
const r02 = bridge402(a02, ts(), () => short);
attack("A02", "slippage: fill 60bps below quote (cap 50bps)", !r02.success,
  `actual ${short}, min ${qShort(a02)} — ${checkDetail(r02, "slippage")}`);

function qShort(i: PaymentIntent): string {
  // recompute minOutput for display: required * (1 - maxSlippageBps/10000)
  const required = parseFloat(i.requirement.accepts[0].amount);
  return (required * (1 - i.policy.maxSlippageBps / 10000)).toFixed(6);
}

// A03 — no valid route from treasury asset.
const a03 = intent("wBRL", "0.08");
a03.treasury = { cNGN: "50" };
const r03 = bridge402(a03, ts());
attack("A03", "no route: cNGN treasury vs wBRL merchant", !r03.success, r03.reason);

// A04 — insufficient balance for required amount.
const a04 = intent("wBRL", "80.0");
a04.treasury = { USDC: "2.00" };
const r04 = bridge402(a04, ts());
attack("A04", "insufficient balance (need ≈16.3 USDC, have 2.00)", !r04.success,
  r04.checks.find((c) => c.name === "treasury")?.detail ?? r04.reason);

// A05 — 402 timeout exceeds policy window.
const a05 = intent("wBRL", "0.08");
a05.requirement.accepts[0] = { ...a05.requirement.accepts[0], maxTimeoutSeconds: 999 };
const r05 = bridge402(a05, ts());
attack("A05", "402 timeout exceeds policy window (999s vs 120s)", !r05.success, checkDetail(r05, "expiry"));

// A06 — price impact exceeds bound: fill loses 3% vs quote under a 5bps cap.
const a06 = intent("wBRL", "0.08", { ...DEFAULT_POLICY, maxSlippageBps: 5 });
const r06 = bridge402(a06, ts(), (q) => (Number(q.expectedOutput) * 0.97).toFixed(6));
attack("A06", "price impact 3% exceeds 5bps bound", !r06.success, checkDetail(r06, "priceImpact"));

// A07 — payer compromised: treasury looted (insufficient) → nothing moves.
const a07 = intent("wBRL", "0.08");
a07.treasury = { USDC: "0" };
const r07 = bridge402(a07, ts());
attack("A07", "compromised payer / empty treasury: no tx leaked", !r07.success,
  r07.reason + (r07.paymentTxHash ? ` (LEAKED: ${r07.paymentTxHash})` : ", no payment emitted"));

// Control — honest case must succeed end to end through the real checpath.
const control = bridge402(intent("wBRL", "0.08"), ts());
console.log(`${control.success ? "✅" : "❌"} CONTROL USDC→wBRL $0.08: ${control.success ? "PAID (route + policy + settle pass)" : "CONTROL FAILED"}`);
if (!control.success) failures++;

console.log(`\n${blocked}/7 adversarial scenarios neutralized${failures ? `, ${failures} FAILURE(S)` : ""}.`);
if (failures) process.exitCode = 1;