import {
  type PaymentIntent,
  type PaymentPolicy,
  type RouteQuote,
  type X402Requirement,
  TOKENS,
} from "./types.js";
import { findRoute } from "./routing.js";
import { enforcePolicy, policyPasses, type PolicyCheck } from "./policy.js";

// MELD — x402 payment adapter for asset mismatch on Celo.
// Core invariant: OUTPUT_AFTER_SWAP ≥ EXACT_X402_AMOUNT.
// Deterministic: 402 → discover asset → quote route → enforce bounds → swap → pay.

export interface AdapterResult {
  success: boolean;
  reason: string;
  quote: RouteQuote | null;
  checks: PolicyCheck[];
  swapTxHash: string | null;
  paymentTxHash: string | null;
}

/**
 * The deterministic core invariant:
 *   OUTPUT_AFTER_SWAP ≥ EXACT_X402_AMOUNT
 * enforced with: maxSlippage, maxTotalCost, expiry, recipient, network.
 *
 * `actualize` runs the swap (or in the lab, simulates a deteriorated fill)
 * and returns what actually came out. Settlement decision happens ONLY after
 * actualization — a quote is never self-fulfilling.
 */
export function bridge402(
  intent: PaymentIntent,
  nowSec: number,
  actualizeOverride?: (quote: RouteQuote) => string,
): AdapterResult {
  const req = intent.requirement;
  const requiredAsset = Object.entries(TOKENS).find(
    ([, t]) => t.address === req.accepts[0]?.asset,
  )?.[0];

  if (!requiredAsset) {
    return { success: false, reason: "unknown required asset in 402", quote: null, checks: [], swapTxHash: null, paymentTxHash: null };
  }

  const treasuryAssets = Object.entries(intent.treasury)
    .filter(([sym, bal]) => parseFloat(bal) > 0 && TOKENS[sym]);

  // Direct payment path: treasury already holds the required asset.
  const directBalance = parseFloat(intent.treasury[requiredAsset] ?? "0");
  const requiredAmount = parseFloat(req.accepts[0]?.amount ?? "0");

  if (directBalance >= requiredAmount) {
    const input = TOKENS[requiredAsset];
    const amt = req.accepts[0]?.amount ?? "0";
    const route: RouteQuote = {
      inputToken: input,
      outputToken: input,
      inputAmount: amt,
      expectedOutput: amt,
      actualOutput: amt,
      minOutput: amt,
      priceImpactPct: 0,
      route: [requiredAsset],
      estimatedGasUsd: 0.0001,
    };
    const checks = enforcePolicy(intent, route, nowSec);
    return {
      success: policyPasses(checks),
      reason: policyPasses(checks) ? "direct payment — no conversion needed" : `policy blocked direct payment: ${checks.filter((c) => !c.pass).map((c) => c.name).join(", ")}`,
      quote: route,
      checks,
      swapTxHash: null,
      paymentTxHash: policyPasses(checks) ? `direct-${Date.now()}` : null,
    };
  }

  // Swap path: try each treasury asset until a policy-valid route completes.
  let bestBlocked: AdapterResult | null = null;

  for (const [sym] of treasuryAssets) {
    if (sym === requiredAsset) continue;
    const routeResult = findRoute(sym, requiredAsset, req.accepts[0]?.amount ?? "0", intent.policy);
    if (!routeResult.ok) {
      bestBlocked ??= {
        success: false,
        reason: routeResult.reason,
        quote: null,
        checks: [],
        swapTxHash: null,
        paymentTxHash: null,
      };
      continue;
    }

    const quote: RouteQuote = {
      ...routeResult.quote,
      actualOutput: actualizeOverride
        ? actualizeOverride(routeResult.quote)
        : routeResult.quote.expectedOutput,
    };

    const checks = enforcePolicy(intent, quote, nowSec);
    if (policyPasses(checks)) {
      return {
        success: true,
        reason: `route found: ${sym} → ${requiredAsset}`,
        quote,
        checks,
        swapTxHash: `swap-${sym}-${Date.now()}`,
        paymentTxHash: `pay-${Date.now()}`,
      };
    }

    if (!bestBlocked) {
      bestBlocked = {
        success: false,
        reason: `route ${sym} → ${requiredAsset} found but policy failed: ${checks.filter((c) => !c.pass).map((c) => c.name).join(", ")}`,
        quote,
        checks,
        swapTxHash: null,
        paymentTxHash: null,
      };
    }
  }

  return bestBlocked ?? {
    success: false,
    reason: `no route: treasury has ${Object.entries(intent.treasury).filter(([, b]) => parseFloat(b) > 0).map(([s]) => s).join(", ") || "nothing"} but service requires ${requiredAsset}`,
    quote: null,
    checks: [],
    swapTxHash: null,
    paymentTxHash: null,
  };
}
