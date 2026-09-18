export interface FxQuote {
  pair: string; // e.g. "USD/NGN"
  rate: number; // e.g. 1542.5
  timestamp: number; // unix seconds (source observation time)
  source: string; // provenance, e.g. "cbn" | "parallel" | "binance" | "kraken"
}

export interface FxRequirements {
  count: number; // exact required records, e.g. 100
  maxAgeSec: number; // freshness, e.g. 60
  pairs: string[]; // allowed pairs, e.g. ["USD/NGN"]
  sources: string[]; // allowed provenance set (empty = any non-empty source)
  requireUniqueTimestamps: boolean;
  minRate: number; // sanity bounds to catch poisoned results
  maxRate: number;
}

export const DEFAULT_FX_REQUIREMENTS: FxRequirements = {
  count: 100,
  maxAgeSec: 120,
  pairs: ["USD/NGN"],
  sources: [],
  requireUniqueTimestamps: true,
  minRate: 500,
  maxRate: 5000,
};

export type CommitmentStatus =
  | "FUNDED"
  | "SUBMITTED"
  | "SETTLED"
  | "REJECTED"
  | "EXPIRED_REFUNDED";
