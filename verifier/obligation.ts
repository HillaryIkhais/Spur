import { createHash } from "node:crypto";
import { verifyFxQuotes } from "./verify.js";
import type { FxQuote, FxRequirements } from "./requirements.js";

// ── Machine-readable obligation (v2 thesis) ────────────────────────────────
// A JOB precommits acceptance conditions BEFORE work begins. A RESULT must
// satisfy them. Delegation may decompose but never weaken (checked both
// off-chain here and on-chain in ClearObligations.delegate).

export interface JobObligation {
  jobId: number;
  parentJobId: number; // 0 = root
  objective: string;
  count: number;
  maxAgeSec: number;
  pairs: string[];
  schemaHash: string;
  evidenceHash: string;
  methodHash: string; // allowed methods/sources — child must match (no method escape)
  amountUsdt: number;
  expirySec: number;
  providerAgentId: number;
  buyerAgentId: number;
}

export interface Evidence {
  quotes: FxQuote[];
  sources: string[];
  executionReceipt: string; // e.g. "queried cbn+parallel+binance @ <ts>"
  attestation: string; // provider-signed claim (NOT trusted — verifier rechecks)
}

export function obligationHash(o: JobObligation): string {
  return "0x" + createHash("sha256").update(JSON.stringify([
    o.objective, o.count, o.maxAgeSec, o.pairs, o.schemaHash,
    o.evidenceHash, o.methodHash, o.amountUsdt, o.expirySec,
  ])).digest("hex");
}

/** Non-widening check: child ⊆ parent. Returns list of violations (empty = OK). */
export function checkDelegationNarrowing(parent: JobObligation, child: JobObligation): string[] {
  const v: string[] = [];
  if (child.amountUsdt > parent.amountUsdt) v.push(`amount ${child.amountUsdt} > parent ${parent.amountUsdt}`);
  if (child.count !== parent.count) v.push(`count ${child.count} != parent ${parent.count} (same output obligation)`);
  if (child.maxAgeSec > parent.maxAgeSec) {
    v.push(`freshness weakened: child allows ${child.maxAgeSec}s > parent ${parent.maxAgeSec}s`);
  }
  if (child.expirySec > parent.expirySec) v.push(`expiry ${child.expirySec} later than parent ${parent.expirySec}`);
  if (child.schemaHash !== parent.schemaHash) v.push("schemaHash changed (silent respec)");
  if (child.evidenceHash !== parent.evidenceHash) v.push("evidenceHash changed (weaker proof)");
  if (child.methodHash !== parent.methodHash) v.push("methodHash changed (method escape)");
  const pairsWeakened = child.pairs.some((p) => !parent.pairs.includes(p));
  if (pairsWeakened) v.push("pairs widened beyond parent set");
  return v;
}

export interface ObligationVerdict {
  satisfied: boolean;
  resultHash: string;
  obligationHash: string;
  detail: string;
}

/** RESULT satisfies JOB? Independent recheck — provider attestation is ignored. */
export function evaluateObligation(
  job: JobObligation,
  ev: Evidence,
  nowSec: number,
): ObligationVerdict {
  const req: FxRequirements = {
    count: job.count,
    maxAgeSec: job.maxAgeSec,
    pairs: job.pairs,
    sources: [],
    requireUniqueTimestamps: true,
    minRate: 500,
    maxRate: 5000,
  };
  const v = verifyFxQuotes(ev.quotes, req, nowSec);
  const oh = obligationHash(job);
  if (!v.valid) {
    return { satisfied: false, resultHash: v.resultHash, obligationHash: oh, detail: `PROOF ≠ OBLIGATION: ${v.reason}` };
  }
  return { satisfied: true, resultHash: v.resultHash, obligationHash: oh, detail: "RESULT satisfies JOB" };
}

export interface SettlementReceipt {
  jobId: number;
  buyer: string;
  provider: string;
  chain: string;
  requirements: string[];
  result: string;
  settlement: string;
  reputation: string[];
}

export function renderReceipt(
  job: JobObligation,
  verdict: ObligationVerdict,
  chain: string,
  buyer: string,
  provider: string,
): SettlementReceipt {
  return {
    jobId: job.jobId,
    buyer,
    provider,
    chain,
    requirements: [
      `${job.count} records`,
      `freshness < ${job.maxAgeSec}s`,
      `pairs: ${job.pairs.join(",")}`,
      `schema ${job.schemaHash.slice(0, 10)}…`,
      `evidence ${job.evidenceHash.slice(0, 10)}…`,
    ],
    result: verdict.satisfied ? "satisfies obligation" : verdict.detail,
    settlement: verdict.satisfied
      ? `$${job.amountUsdt.toFixed(2)} USDT → ${provider}`
      : `BLOCKED → refunded to buyer (${verdict.detail})`,
    reputation: verdict.satisfied
      ? [`${provider} +1 verified completion`, `$${job.amountUsdt.toFixed(2)} earned`]
      : [`${provider} +1 rejection`, `$${job.amountUsdt.toFixed(2)} disputed`],
  };
}
