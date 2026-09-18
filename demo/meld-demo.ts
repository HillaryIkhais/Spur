import { bridge402 } from "../meld/adapter.js";
import { intent, DEFAULT_POLICY, fmtQuote } from "../meld/fixtures.js";
import { TOKENS, type PaymentIntent, type RouteQuote } from "../meld/types.js";

const ts = () => Math.floor(Date.now() / 1000);
const symOf = (i: PaymentIntent) =>
  Object.entries(TOKENS).find(([, t]) => t.address === i.requirement.accepts[0].asset)?.[0] ?? "?";

let failures = 0;
const demo = (label: string, i: PaymentIntent, expect: "ok" | "blocked", actualize?: (q: RouteQuote) => string) => {
  const r = bridge402(i, ts(), actualize);
  const pass = expect === "ok" ? r.success : !r.success;
  if (!pass) failures++;
  console.log(`\n[${pass ? "PASS" : "FAIL"}] ${label}`);
  console.log(`  treasury: ${Object.entries(i.treasury).map(([s, b]) => `${s} ${b}`).join(", ")}`);
  console.log(`  requirement: ${i.requirement.accepts[0].amount} ${symOf(i)} (${i.requirement.accepts[0].asset.slice(0, 10)}…)`);
  if (r.quote) console.log(`  route: ${fmtQuote(r.quote)}`);
  console.log(`  outcome: ${r.reason}`);
  for (const c of r.checks) console.log(`    ${c.pass ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  if (r.swapTxHash) console.log(`  swap tx: ${r.swapTxHash}`);
  if (r.paymentTxHash) console.log(`  x402 tx: ${r.paymentTxHash}`);
  if (actualize && r.quote) console.log(`  actual fill overridden → ${actualize(r.quote)} ${r.quote.outputToken.symbol}`);
};

demo("USDC treasury → merchant requires wBRL", intent("wBRL", "0.08"), "ok");
demo("USDC treasury → merchant requires wARS (small)", intent("wARS", "80"), "ok");
demo("USDC treasury → merchant requires cNGN", intent("cNGN", "3.5"), "ok");
demo("Direct payment (agent already holds wBRL)", intent("wBRL", "0.08", DEFAULT_POLICY, { wBRL: "5.0" }), "ok");
demo("Insufficient budget (USDC 12.41, need 1.30 → exceeds $1 cap)", intent("wARS", "1500"), "blocked");
demo("Deteriorated fill under 10bps cap", intent("wBRL", "0.08", { ...DEFAULT_POLICY, maxSlippageBps: 10 }), "blocked", (q) => (Number(q.expectedOutput) * 0.95).toFixed(6));

console.log(failures ? `\n${failures} demo(s) failed` : "\nAll happy-path + policy-blocked demos pass. Invariant held: OUTPUT_AFTER_SWAP ≥ EXACT_X402_AMOUNT.");
if (failures) process.exitCode = 1;