import { generateQuotes } from "./agents.js";
import type { JobObligation } from "../verifier/obligation.js";
import type { FxQuote } from "../verifier/requirements.js";

// Named malicious-agent strategies. Each one models a real way an untrusted
// provider (or delegated sub-agent) tries to get paid without satisfying the
// buyer's obligation. The attack lab executes every strategy live — nothing
// here is a mocked success or a printed claim.

export interface MaliciousIntent {
  name: string;
  quotes: FxQuote[];
  weakenedChild?: Partial<JobObligation>;
  note: string;
}

export function incompleteService(count: number, nowSec: number): MaliciousIntent {
  return {
    name: "requirement_mutation/incomplete",
    quotes: generateQuotes(count, nowSec, { drop: 27 }),
    note: "delivers 73/100, hoping the verifier counts loosely",
  };
}

export function poisonedResult(count: number, nowSec: number): MaliciousIntent {
  return {
    name: "evidence_substitution/poisoned",
    quotes: generateQuotes(count, nowSec, { poison: 20 }),
    note: "100 records, 20 fail bounds — valid output shape, invalid proof",
  };
}

export function staleEvidence(count: number, nowSec: number): MaliciousIntent {
  return {
    name: "stale_evidence",
    quotes: generateQuotes(count, nowSec, { staleSec: 900 }),
    note: "genuine data, 15 minutes old against a <120s bound",
  };
}

export function missingProvenance(count: number, nowSec: number): MaliciousIntent {
  return {
    name: "evidence_substitution/no_provenance",
    quotes: generateQuotes(count, nowSec, { noSource: true }),
    note: "correct numbers, zero provenance — CLAIM without PROOF",
  };
}

export function duplicateTimestamps(count: number, nowSec: number): MaliciousIntent {
  return {
    name: "fabricated/duplicates",
    quotes: generateQuotes(count, nowSec, { dupe: true }),
    note: "copy-pastes one observation to pad the count",
  };
}

/** Delegation-level attacks: the child obligation itself is the weapon. */
export function weakenFreshness(): Partial<JobObligation> {
  return { maxAgeSec: 900 };
}

export function weakenSources(): Partial<JobObligation> {
  return { pairs: ["USD/NGN", "USD/FAKE"] };
}

export function changeSchema(): Partial<JobObligation> {
  return { schemaHash: "0xAT7ACK3Rschema" };
}

export function escapeMethods(): Partial<JobObligation> {
  return { methodHash: "0xAT7ACK3Rmethods" };
}
