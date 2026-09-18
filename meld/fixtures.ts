import type {
  PaymentIntent,
  PaymentPolicy,
  X402Requirement,
  RouteQuote,
} from "./types.js";
import { TOKENS } from "./types.js";

// Shared fixtures for MELD demos and attack lab.

export const DEFAULT_POLICY: PaymentPolicy = {
  maxSlippageBps: 50, // 0.5%
  maxTotalCostUsd: 1.0,
  maxRouteHops: 2,
  expirySec: 120,
};

export const USDC_TREASURY: Record<string, string> = { USDC: "12.41" };

export function x402Requirement(assetSymbol: string, amount: string, payTo: string = "0xM3rch4nt0000000000000000000000000000000"): X402Requirement {
  return {
    x402Version: 1,
    accepts: [{
      scheme: "exact",
      network: "celo",
      asset: TOKENS[assetSymbol].address,
      payTo,
      amount,
      maxTimeoutSeconds: 120,
    }],
    resource: "/v1/fx-quotes",
    spec: { count: 10, freshnessSec: 120, pair: "USD/NGN" },
  };
}

export function intent(
  assetSymbol: string,
  amount: string,
  policy = DEFAULT_POLICY,
  treasury = USDC_TREASURY,
): PaymentIntent {
  return {
    requirement: x402Requirement(assetSymbol, amount),
    policy,
    treasury,
  };
}

export function fmtQuote(q: RouteQuote | null): string {
  if (!q) return "NO QUOTE";
  return [
    `${q.route.join(" → ")}`,
    `in: ${q.inputAmount} ${q.inputToken.symbol}`,
    `out: ${q.expectedOutput} ${q.outputToken.symbol}`,
    `minOut: ${q.minOutput}`,
    `impact: ${q.priceImpactPct}%`,
  ].join("  |  ");
}