import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Smoke test for the distribution loop: post → bid → submit(good) → SETTLED,
// then post → bid → submit(poisoned) → REJECTED, reputation accrues both ways.
// Runs against a temp CLEAR_DATA_DIR so the real ./data is untouched.
process.env.CLEAR_DATA_DIR = mkdtempSync(join(tmpdir(), "clear-smoke-"));

const { handleTelegramUpdate, submitEvidence } = await import("./telegram.js");

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

const now = Math.floor(Date.now() / 1000);
const goodQuotes = Array.from({ length: 10 }, (_, i) => ({
  pair: "USD/NGN",
  rate: 1500 + i,
  timestamp: now - i,
  source: ["cbn", "parallel", "binance"][i % 3],
}));

const r1 = handleTelegramUpdate({ message: { text: "/job $0.10 10 fresh USD/NGN observations", from: { username: "alice" } } });
check("post job", r1.includes("JOB #1843"), r1);
check("bid own job refused", handleTelegramUpdate({ message: { text: "/bid 1843", from: { username: "alice" } } }).includes("cannot accept"));
check("bid job", handleTelegramUpdate({ message: { text: "/bid 1843", from: { username: "bob" } } }).includes("ACCEPTED"));
check("double bid refused", handleTelegramUpdate({ message: { text: "/bid 1843", from: { username: "mallory" } } }).includes("no longer OPEN"));

const s1 = submitEvidence(1843, "mallory", goodQuotes, now);
check("wrong provider refused", !s1.ok, s1.receipt);
const s2 = submitEvidence(1843, "@bob", goodQuotes, now);
check("honest delivery settles", s2.ok && s2.settled, s2.receipt);

const r2 = handleTelegramUpdate({ message: { text: "/job second job", from: { username: "alice" } } });
check("post second job", r2.includes("JOB #1844"), r2);
handleTelegramUpdate({ message: { text: "/bid 1844", from: { username: "bob" } } });
const poisoned = goodQuotes.map((q, i) => (i < 3 ? { ...q, rate: -999 } : q));
const s3 = submitEvidence(1844, "@bob", poisoned, now);
check("poisoned delivery rejected", s3.ok && !s3.settled, s3.receipt);

const rep = handleTelegramUpdate({ message: { text: "/rep @bob", from: { username: "alice" } } });
check("reputation accrues both ways", rep.includes("completed: 1") && rep.includes("rejected: 1"), rep);
check("status shows receipt", handleTelegramUpdate({ message: { text: "/status 1843", from: { username: "alice" } } }).includes("SETTLED"));
check("services menu lists tiers", handleTelegramUpdate({ message: { text: "/services", from: { username: "alice" } } }).includes("FX verification"));
const fx = handleTelegramUpdate({ message: { text: "/fx", from: { username: "carol" } } });
check("one-tap /fx posts standard job", fx.includes("OPEN") && fx.includes("$0.08"), fx);
check("/jobs lists open work", handleTelegramUpdate({ message: { text: "/jobs", from: { username: "dave" } } }).includes("#1845"));

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nDistribution loop smoke: post → bid → settle → reject → reputation. All green.");
}
