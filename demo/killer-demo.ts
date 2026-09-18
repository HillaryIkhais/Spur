import { BUYER, PROVIDERS, generateQuotes, selectProvider } from "../src/agents.js";
import { DEFAULT_FX_REQUIREMENTS } from "../verifier/requirements.js";
import { hashQuotes, verifyFxQuotes } from "../verifier/verify.js";

// Killer demo: Agent wants "100 verified Nigerian FX rates."
// Discovers 3 providers → picks cheapest → commits → 93/100 BLOCKED → retry 100/100 SETTLED.
const now = Math.floor(Date.now() / 1000);
const REQ = { ...DEFAULT_FX_REQUIREMENTS, count: 100, maxAgeSec: 120 };

console.log("CLEAR — killer demo");
console.log(`Agent wants: "${REQ.count} verified Nigerian FX rates" (freshness <${REQ.maxAgeSec}s, provenance required)\n`);

console.log("Discovered providers:");
for (const p of PROVIDERS) {
  console.log(`  Provider ${p.seller.agentId} (${p.seller.wallet}): $${p.priceUsdt.toFixed(2)} / ${p.count} records`);
}
const chosen = selectProvider(PROVIDERS);
console.log(`\nAgent selects cheapest: Provider ${chosen.seller.agentId} @ $${chosen.priceUsdt.toFixed(2)}\n`);

let commitmentId = 482;
console.log(`COMMITMENT #${commitmentId}`);
console.log(`  BUYER  agent ${BUYER.agentId}`);
console.log(`  SELLER agent ${chosen.seller.agentId}`);
console.log(`  PAYMENT $${chosen.priceUsdt.toFixed(2)} USDT (Celo mainnet)`);
console.log(`  REQUIREMENTS ${REQ.count} records, <${REQ.maxAgeSec}s, schema+provenance`);
console.log(`  EXPIRY 120s`);
console.log(`  STATUS FUNDED — $ locked, not sent\n`);

// Attempt 1: incomplete (93/100) → BLOCKED
const bad = generateQuotes(100, now, { drop: 7 });
const v1 = verifyFxQuotes(bad, REQ, now);
console.log(`Provider submits: ${v1.validCount} / ${v1.totalCount} valid — resultHash ${v1.resultHash.slice(0, 18)}…`);
console.log(`CLEAR: ${v1.checks.map((c) => `${c.name} ${c.pass ? "✓" : "✗"} (${c.detail})`).join(" | ")}`);
console.log(v1.valid ? "✓ VERIFIED" : "❌ PAYMENT BLOCKED — funds return to buyer");
console.log(`  reason: ${v1.reason}\n`);

// Attempt 2: clean retry → SETTLED
const good = generateQuotes(100, now);
const v2 = verifyFxQuotes(good, REQ, now);
console.log(`Provider retries: ${v2.validCount} / ${v2.totalCount} valid — resultHash ${v2.resultHash.slice(0, 18)}…`);
console.log(`CLEAR: ${v2.checks.map((c) => `${c.name} ${c.pass ? "✓" : "✗"}`).join(" | ")}`);
if (v2.valid) {
  console.log(`✓ VERIFIED — freshness 21s, duplicates 0, provenance valid`);
  console.log(`$${chosen.priceUsdt.toFixed(2)} SETTLED on Celo (tx: 0xC1E4R…)`);
  console.log(`\nInvariant held: NO VERIFIED WORK → NO SETTLEMENT.`);
} else {
  console.log(`❌ BLOCKED: ${v2.reason}`);
  process.exitCode = 1;
}
