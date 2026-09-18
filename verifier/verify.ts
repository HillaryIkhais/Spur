import { createHash } from "node:crypto";
import { DEFAULT_FX_REQUIREMENTS, type FxQuote, type FxRequirements } from "./requirements.js";

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface VerifyResult {
  valid: boolean;
  validCount: number;
  totalCount: number;
  checks: CheckResult[];
  resultHash: string;
  reason: string;
}

/** Canonical hash of the result set — committed on-chain via submitWork(). */
export function hashQuotes(quotes: FxQuote[]): string {
  const canonical = [...quotes]
    .map((q) => ({
      pair: q.pair,
      rate: q.rate,
      timestamp: q.timestamp,
      source: q.source,
    }))
    .sort((a, b) =>
      a.timestamp - b.timestamp || a.source.localeCompare(b.source) || a.rate - b.rate,
    );
  return "0x" + createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * DETERMINISTIC verifier. No LLM, no network, no discretion.
 * Returns valid=true ONLY if every requirement passes.
 * This is the off-chain counterpart to ClearSettlement.resolve(valid).
 */
export function verifyFxQuotes(
  quotes: FxQuote[],
  req: FxRequirements = DEFAULT_FX_REQUIREMENTS,
  nowSec: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  const checks: CheckResult[] = [];

  // 1. count — exact match (73/100 fails, 101/100 fails)
  const countPass = quotes.length === req.count;
  checks.push({
    name: "count",
    pass: countPass,
    detail: `${quotes.length} / ${req.count} records`,
  });

  // 2. schema + bounds per record
  let schemaFails = 0;
  let schemaDetail = "all records valid schema";
  quotes.forEach((q, i) => {
    const okPair = typeof q.pair === "string" && req.pairs.includes(q.pair);
    const okRate =
      typeof q.rate === "number" && Number.isFinite(q.rate) && q.rate >= req.minRate && q.rate <= req.maxRate;
    const okTs = typeof q.timestamp === "number" && Number.isInteger(q.timestamp) && q.timestamp > 0;
    const okSource = typeof q.source === "string" && q.source.length > 0 &&
      (req.sources.length === 0 || req.sources.includes(q.source));
    if (!(okPair && okRate && okTs && okSource)) {
      schemaFails++;
      if (schemaFails === 1) {
        schemaDetail =
          `record[${i}] invalid (pair=${q.pair} rate=${q.rate} ts=${q.timestamp} source=${q.source})`;
      }
    }
  });
  checks.push({ name: "schema", pass: schemaFails === 0, detail: schemaDetail });

  // 3. freshness — EVERY record must be < maxAgeSec old (15-min-old data fails)
  let stale = 0;
  let maxAge = 0;
  for (const q of quotes) {
    const age = nowSec - q.timestamp;
    if (age > maxAge) maxAge = age;
    if (age < 0 || age > req.maxAgeSec) stale++;
  }
  checks.push({
    name: "freshness",
    pass: stale === 0,
    detail: stale === 0 ? `newest age ${maxAge}s < ${req.maxAgeSec}s` : `${stale} stale records (max age ${maxAge}s)`,
  });

  // 4. uniqueness — no duplicate timestamps when required
  let dupes = 0;
  if (req.requireUniqueTimestamps) {
    const seen = new Set<number>();
    for (const q of quotes) {
      if (seen.has(q.timestamp)) dupes++;
      seen.add(q.timestamp);
    }
  }
  checks.push({
    name: "uniqueness",
    pass: dupes === 0,
    detail: dupes === 0 ? "0 duplicates" : `${dupes} duplicate timestamps`,
  });

  // 5. provenance — every record must carry a source
  const missingProv = quotes.filter((q) => !q.source || q.source.length === 0).length;
  checks.push({
    name: "provenance",
    pass: missingProv === 0,
    detail: missingProv === 0 ? "provenance present on all records" : `${missingProv} missing provenance`,
  });

  const validCount = quotes.length - schemaFails;
  const valid = checks.every((c) => c.pass);
  const resultHash = hashQuotes(quotes);
  const reason = valid ? "all checks passed" : checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`).join("; ");

  return { valid, validCount, totalCount: quotes.length, checks, resultHash, reason };
}

// CLI: `npm run verify` runs a quick self-check.
if (process.argv[1]?.endsWith("verify.ts")) {
  const now = Math.floor(Date.now() / 1000);
  const good = Array.from({ length: 10 }, (_, i) => ({
    pair: "USD/NGN",
    rate: 1500 + i,
    timestamp: now - i,
    source: "demo",
  }));
  console.log(verifyFxQuotes(good, { ...DEFAULT_FX_REQUIREMENTS, count: 10 }, now));
}
