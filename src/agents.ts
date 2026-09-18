import type { FxQuote } from "../verifier/requirements.js";

export interface AgentRegistration {
  agentId: number; // ERC-8004 on-chain agent ID
  wallet: string; // Celo address
  endpoint: string; // x402 service URL or Telegram handle
  telegram?: string;
}

export interface ServiceOffer {
  seller: AgentRegistration;
  priceUsdt: number; // e.g. 0.06
  count: number;
  etaSec: number;
}

export const BUYER: AgentRegistration = {
  agentId: 1,
  wallet: "0xBuyer000000000000000000000000000000000001",
  endpoint: "https://clear.demo/buyer",
  telegram: "@clear_buyer_bot",
};

export const PROVIDERS: ServiceOffer[] = [
  {
    seller: { agentId: 101, wallet: "0xProviderA00000000000000000000000000000001", endpoint: "https://clear.demo/provider-a" },
    priceUsdt: 0.08,
    count: 100,
    etaSec: 20,
  },
  {
    seller: { agentId: 102, wallet: "0xProviderB00000000000000000000000000000002", endpoint: "https://clear.demo/provider-b" },
    priceUsdt: 0.11,
    count: 100,
    etaSec: 15,
  },
  {
    seller: { agentId: 103, wallet: "0xProviderC00000000000000000000000000000003", endpoint: "https://clear.demo/provider-c" },
    priceUsdt: 0.06,
    count: 100,
    etaSec: 25,
  },
];

/** Buyer policy: cheapest provider that meets the spec. Deterministic — no LLM. */
export function selectProvider(offers: ServiceOffer[]): ServiceOffer {
  return [...offers].sort((a, b) => a.priceUsdt - b.priceUsdt)[0];
}

export interface AgentWorkHistory {
  agentId: number;
  verified: number;
  rejected: number;
  expired: number;
  valueSettled: number;
}

/** Reputation-gated hire: cheapest provider whose verified completion rate
 *  clears the buyer's bar. WORK → PROOF → SETTLEMENT → REPUTATION → FUTURE WORK. */
export function selectByReputation(
  offers: ServiceOffer[],
  history: Map<number, AgentWorkHistory>,
  minVerifiedRate: number,
): ServiceOffer | null {
  const eligible = offers.filter((o) => {
    const h = history.get(o.seller.agentId);
    if (!h || h.verified + h.rejected + h.expired === 0) return false; // no history, no hire
    const total = h.verified + h.rejected + h.expired;
    return h.verified / total >= minVerifiedRate;
  });
  if (eligible.length === 0) return null;
  return eligible.sort((a, b) => a.priceUsdt - b.priceUsdt)[0];
}

/** Mock seller: generates `count` fresh quotes (or a sabotaged variant). */
export function generateQuotes(
  count: number,
  nowSec: number,
  opts: { staleSec?: number; drop?: number; poison?: number; dupe?: boolean; noSource?: boolean } = {},
): FxQuote[] {
  const n = count - (opts.drop ?? 0);
  const quotes: FxQuote[] = [];
  const baseAge = opts.staleSec ?? 0;
  for (let i = 0; i < n; i++) {
    quotes.push({
      pair: "USD/NGN",
      rate: 1500 + (i % 50) + Math.random() * 2,
      // Unique per-record timestamps (one per second); all fresh when baseAge=0
      // and maxAgeSec >= count. NOTE: a <60s window cannot hold 100 unique
      // second-resolution timestamps — hence default maxAgeSec 120.
      timestamp: nowSec - baseAge - i,
      source: opts.noSource ? "" : ["cbn", "parallel", "binance"][i % 3],
    });
  }
  if (opts.poison) {
    for (let i = 0; i < opts.poison && i < quotes.length; i++) {
      quotes[i].rate = -999; // fails schema/bounds check
    }
  }
  if (opts.dupe && quotes.length > 1) {
    quotes[1].timestamp = quotes[0].timestamp; // duplicate timestamp
  }
  return quotes;
}
