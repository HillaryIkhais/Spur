import type { CeloToken, RouteQuote, PaymentPolicy } from "./types.js";
import { TOKENS } from "./types.js";

// Deterministic routing engine: no LLM, no network, no discretion.
// Given (inputToken, requiredAmount, requiredToken, policy) → quote or null.
// Every quote carries the exact bounds the payment enforcer will check.

function resolveToken(symbolOrAddress: string): CeloToken | null {
  if (TOKENS[symbolOrAddress]) return TOKENS[symbolOrAddress];
  const entry = Object.values(TOKENS).find((t) => t.address === symbolOrAddress);
  return entry ?? null;
}

function prc(n: number, precision = 6): string {
  return n.toFixed(precision).replace(/0+$/, "").replace(/\.$/, "");
}

// Static rate table (in production: DEX pool reserves or oracle).
// rate[from][to] = how many `to` units per 1 `from` unit.
const RATES: Record<string, Record<string, number>> = {
  USDC: { USDT: 1.0, cUSD: 1.0, wBRL: 4.92, wARS: 1150, wCOP: 3950, cNGN: 1542, USAT: 1.0 },
  USDT: { USDC: 1.0, cUSD: 1.0, wBRL: 4.92, wARS: 1150, wCOP: 3950, cNGN: 1542, USAT: 1.0 },
  cUSD: { USDC: 1.0, USDT: 1.0, wBRL: 4.92, wARS: 1150, wCOP: 3950, cNGN: 1542, USAT: 1.0 },
  wBRL: { USDC: 0.2033, USDT: 0.2033, cUSD: 0.2033 },
  wARS: { USDC: 0.00087, USDT: 0.00087, cUSD: 0.00087 },
  wCOP: { USDC: 0.000253, USDT: 0.000253, cUSD: 0.000253 },
  cNGN: { USDC: 0.000649, USDT: 0.000649, cUSD: 0.000649 },
  USAT: { USDC: 1.0, USDT: 1.0, cUSD: 1.0 },
};

/** rate returns how many `to` units you get per 1 `from` unit. */
export function getRate(from: string, to: string): number | null {
  const fwd = RATES[from]?.[to];
  if (fwd != null) return fwd;
  const inv = RATES[to]?.[from];
  if (inv != null) return 1 / inv;
  return null;
}

export type RouteResult =
  | { ok: true; quote: RouteQuote }
  | { ok: false; reason: string };

export function findRoute(
  inputSymbol: string,
  outputSymbol: string,
  requiredAmount: string,
  policy: PaymentPolicy,
  priceImpactBps: number = 0,
  hops: string[] = [],
): RouteResult {
  const input = resolveToken(inputSymbol);
  const output = resolveToken(outputSymbol);
  if (!input) return { ok: false, reason: `unknown input token: ${inputSymbol}` };
  if (!output) return { ok: false, reason: `unknown output token: ${outputSymbol}` };

  if (inputSymbol === outputSymbol) {
    return { ok: false, reason: "no conversion needed — pay directly" };
  }

  const rate = getRate(inputSymbol, outputSymbol);
  if (rate == null) return { ok: false, reason: `no route: ${inputSymbol} → ${outputSymbol}` };

  const required = Number(requiredAmount);
  const inputNeeded = required / rate; // human, input units
  const minOutput = required * (1 - policy.maxSlippageBps / 10000);
  const effectiveRoute = hops.length > 0 ? hops : [inputSymbol, outputSymbol];
  if (effectiveRoute.length - 1 > policy.maxRouteHops) {
    return { ok: false, reason: `route has ${effectiveRoute.length - 1} hops, policy allows ${policy.maxRouteHops}` };
  }

  return {
    ok: true,
    quote: {
      inputToken: input,
      outputToken: output,
      inputAmount: prc(inputNeeded),
      expectedOutput: prc(required),
      actualOutput: prc(required),
      minOutput: prc(minOutput),
      priceImpactPct: priceImpactBps / 100,
      route: effectiveRoute,
      estimatedGasUsd: 0.0001,
    },
  };
}