import { createHash } from "node:crypto";
import { hashQuotes } from "./verify.js";
import type { FxQuote } from "./requirements.js";

// Evidence is first-class: a provider never submits "the answer".
// It submits a Result envelope — output + evidence + provenance + receipt —
// and the verifier reconstructs the claim from scratch. CLAIM != PROOF.
// The bound hash ties a result to ONE obligation (I7/I8): a valid result
// for Job A is not a valid result for Job B. Replay and cross-job
// presentation fail binding even when the underlying data is genuine.

export interface ResultEnvelope {
  jobId: number;
  obligationHash: string;
  quotes: FxQuote[];
  sources: string[];
  executionReceipt: string;
  quotesHash: string;
  boundHash: string; // hash(jobId, obligationHash, quotesHash) — the settlement key
}

export function buildResult(
  jobId: number,
  obligationHash: string,
  quotes: FxQuote[],
  executionReceipt: string,
): ResultEnvelope {
  const quotesHash = hashQuotes(quotes);
  return {
    jobId,
    obligationHash,
    quotes,
    sources: [...new Set(quotes.map((q) => q.source).filter((s) => s.length > 0))],
    executionReceipt,
    quotesHash,
    boundHash: bindResult(jobId, obligationHash, quotesHash),
  };
}

export function bindResult(jobId: number, obligationHash: string, quotesHash: string): string {
  return "0x" + createHash("sha256")
    .update(JSON.stringify([jobId, obligationHash, quotesHash]))
    .digest("hex");
}

/**
 * Binding check (I8): does this envelope authorize settlement of `jobId`
 * under `obligationHash`? A replayed or cross-job result carries a bound
 * hash committed to a different (job, obligation) pair and fails here —
 * deterministically, without trusting any attestation.
 */
export function verifyBinding(
  envelope: ResultEnvelope,
  jobId: number,
  obligationHash: string,
): { bound: boolean; reason: string } {
  const recomputed = hashQuotes(envelope.quotes);
  if (recomputed !== envelope.quotesHash) {
    return { bound: false, reason: "quotesHash mismatch: evidence tampered after commitment" };
  }
  if (envelope.jobId !== jobId) {
    return { bound: false, reason: `cross-job result: bound to JOB #${envelope.jobId}, presented against JOB #${jobId}` };
  }
  if (envelope.obligationHash !== obligationHash) {
    return { bound: false, reason: "obligation mismatch: result bound to different acceptance conditions" };
  }
  if (envelope.boundHash !== bindResult(jobId, obligationHash, envelope.quotesHash)) {
    return { bound: false, reason: "boundHash mismatch: replay or forgery" };
  }
  return { bound: true, reason: "result bound to this obligation" };
}
