import { generateQuotes, selectByReputation, type AgentWorkHistory } from "../src/agents.js";
import {
  checkDelegationNarrowing,
  evaluateObligation,
  renderReceipt,
  type Evidence,
  type JobObligation,
} from "../verifier/obligation.js";

// 5-act adversarial delegation demo: A($1.00) → B($0.08 job) → B delegates to C($0.04).
// C tries to weaken freshness → BLOCKED. B submits fabricated → REJECTED.
// B submits correct → SETTLED. Reputation accrues on ERC-8004 IDs.
const now = Math.floor(Date.now() / 1000);
const SCHEMA = "0x5CH3MAfxv1";
const EVID = "0x3V1D3NC3src";
const METHODS = "0xM37H0D5cbn";

const root: JobObligation = {
  jobId: 1842, parentJobId: 0,
  objective: "Current USD/NGN quote: 100 observations, 3 independent sources, <120s old, provenance attached",
  count: 100, maxAgeSec: 120, pairs: ["USD/NGN"],
  schemaHash: SCHEMA, evidenceHash: EVID, methodHash: METHODS,
  amountUsdt: 0.08, expirySec: 300,
  providerAgentId: 2, buyerAgentId: 1,
};

console.log("CLEAR v2 — enforceable obligations across untrusted delegation\n");
console.log(`Act 1 — Agent A posts JOB #${root.jobId}: "${root.objective}" ($${root.amountUsdt.toFixed(2)}).`);
console.log("        Agent B accepts. Obligation + funds locked on Celo.\n");

console.log("Act 2 — B secretly delegates to C ($0.04, keeping the spread).");
const child: JobObligation = { ...root, jobId: 1843, parentJobId: 1842, amountUsdt: 0.04, providerAgentId: 3, buyerAgentId: 2 };
let violations = checkDelegationNarrowing(root, child);
console.log(`        Delegation check: ${violations.length === 0 ? "OK — child ⊆ parent (same output, same-or-stricter bounds)" : "VIOLATIONS: " + violations.join("; ")}`);

console.log("\n        C attempts to weaken freshness to <900s (stale data is cheaper)...");
const sneaky: JobObligation = { ...child, maxAgeSec: 900 };
violations = checkDelegationNarrowing(root, sneaky);
console.log(`        ⛔ DELEGATION BLOCKED — ${violations.join("; ")}`);
console.log("        On-chain, ClearObligations.delegate makes this inexpressible: no parameter relaxes bounds.\n");

console.log("Act 3 — B submits a superficially convincing result (20 poisoned rates, no provenance)...");
const fake: Evidence = {
  quotes: generateQuotes(100, now, { poison: 20, noSource: true }),
  sources: ["cbn"],
  executionReceipt: "B claims: queried 3 sources",
  attestation: "B attests: result correct (untrusted)",
};
const vFake = evaluateObligation(root, fake, now);
console.log(`        ${vFake.satisfied ? "✓ SATISFIED?!" : "❌ REJECTED — " + vFake.detail}. Payment remains locked.\n`);

console.log("Act 4 — B submits correct evidence (100 fresh, 3 sources, provenance)...");
const good: Evidence = {
  quotes: generateQuotes(100, now),
  sources: ["cbn", "parallel", "binance"],
  executionReceipt: `queried cbn+parallel+binance @ ${now}`,
  attestation: "B attests: result correct (rechecked anyway)",
};
const vGood = evaluateObligation(root, good, now);
console.log(`        ${vGood.satisfied ? "✓ SATISFIED — verifier independently reconstructed the result." : "❌ " + vGood.detail}`);
console.log(`        $0.08 USDT → Agent B  |  $0.04 USDT → Agent C (child obligation). B nets the spread.\n`);

console.log("Act 5 — Settlement receipt + ERC-8004 reputation:");
const receipt = renderReceipt(root, vGood, "A → B → C", "Agent A (#1)", "Agent B (#2)");
for (const [k, val] of Object.entries(receipt)) {
  console.log(`        ${k}: ${Array.isArray(val) ? val.join("; ") : val}`);
}
console.log("\nAgent B: 1 verified job, 97.7%-style history begins. Agent C: 1 verified execution.");
console.log("Invariant held: delegation decomposed the obligation but never weakened it.");
if (!vGood.satisfied || vFake.satisfied) process.exitCode = 1;

console.log("\nAct 6 — Agent A needs the same report tomorrow. No interviews, no stars:");
const history = new Map<number, AgentWorkHistory>([
  [2, { agentId: 2, verified: 28, rejected: 2, expired: 1, valueSettled: 14.72 }],
  [3, { agentId: 3, verified: 4, rejected: 6, expired: 0, valueSettled: 0.31 }],
]);
const rehire = selectByReputation(
  [
    { seller: { agentId: 2, wallet: "0xB", endpoint: "b" }, priceUsdt: 0.08, count: 100, etaSec: 20 },
    { seller: { agentId: 3, wallet: "0xC", endpoint: "c" }, priceUsdt: 0.05, count: 100, etaSec: 20 },
  ],
  history,
  0.9,
);
console.log(`        Policy: hire cheapest provider with >=90% verified completion.`);
console.log(`        Agent B: 28/31 = 90.3% → eligible. Agent C: 4/10 = 40% → excluded despite $0.05 price.`);
console.log(`        ${rehire ? `Rehired: Agent #${rehire.seller.agentId} @ $${rehire.priceUsdt.toFixed(2)}.` : "No eligible provider — job stays OPEN."}`);
console.log("        WORK → PROOF → SETTLEMENT → REPUTATION → FUTURE WORK. The loop is closed.");
if (!rehire || rehire.seller.agentId !== 2) process.exitCode = 1;
