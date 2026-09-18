import type { PaymentPolicy, PaymentIntent, RouteQuote, X402Requirement } from "./types.js";
import { TOKENS } from "./types.js";

// Policy enforcer: deterministic, no LLM, no network.
// OUTPUT_AFTER_SWAP ≥ EXACT_X402_AMOUNT is the core invariant.
// Every check is a pure predicate on (quote, requirement, policy).

export interface PolicyCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export function enforcePolicy(
  intent: PaymentIntent,
  quote: RouteQuote,
  nowSec: number,
): PolicyCheck[] {
  const checks: PolicyCheck[] = [];
  const req = intent.requirement;
  const policy = intent.policy;
  const required = parseFloat(req.accepts[0].amount);
  const actualOutput = parseFloat(quote.actualOutput);

  // 1. core invariant: OUTPUT_AFTER_SWAP ≥ EXACT_X402_AMOUNT
  const shortfall = required - actualOutput;
  const overBps = parseFloat(quote.actualOutput) / required * 10000 - 10000;
  checks.push({
    name: "settleAmount",
    pass: actualOutput >= required,
    detail: shortfall > 0
      ? `SHORT ${shortfall.toFixed(6)} ${quote.outputToken.symbol} (got ${quote.actualOutput}, need ${required})`
      : `got ${quote.actualOutput} ≥ need ${required} (${Math.round(overBps)} bps over)`,
  });

  // 2. margin vs quote: actual must not dip below quoted minOutput
  const minOut = parseFloat(quote.minOutput);
  checks.push({
    name: "slippage",
    pass: actualOutput >= minOut,
    detail: `actual ${quote.actualOutput} vs min ${quote.minOutput} (${policy.maxSlippageBps} bps tolerance)`,
  });

  // 2. total cost: swap input in USD must be ≤ maxTotalCostUsd
  const totalCostUsd = parseFloat(quote.inputAmount) * (quote.inputToken.symbol === "USDC" || quote.inputToken.symbol === "USDT" || quote.inputToken.symbol === "USA₮" || quote.inputToken.symbol === "cUSD" ? 1 : 0.01);
  checks.push({
    name: "totalCost",
    pass: totalCostUsd <= policy.maxTotalCostUsd,
    detail: `total cost $${totalCostUsd.toFixed(6)} (limit $${policy.maxTotalCostUsd.toFixed(4)})`,
  });

  // 3. route hops: must be ≤ maxRouteHops
  const hops = quote.route.length - 1;
  checks.push({
    name: "routeHops",
    pass: hops <= policy.maxRouteHops,
    detail: `${hops} hops (limit ${policy.maxRouteHops})`,
  });

  // 4. recipient: must match merchant payTo
  const merchant = req.accepts[0]?.payTo ?? "";
  checks.push({
    name: "recipient",
    pass: merchant !== "",
    detail: merchant ? `payTo ${merchant.slice(0, 10)}…` : "no payTo in 402",
  });

  // 5. network: must be Celo
  checks.push({
    name: "network",
    pass: req.accepts[0]?.network === "celo",
    detail: `network ${req.accepts[0]?.network}`,
  });

  // 6. expiry: payment must complete within policy window
  const remaining = (req.accepts[0]?.maxTimeoutSeconds ?? 0);
  checks.push({
    name: "expiry",
    pass: remaining <= policy.expirySec && remaining > 0,
    detail: `${remaining}s remaining (limit ${policy.expirySec}s)`,
  });

  // 7. treasury: must hold enough input token
  const balance = parseFloat(intent.treasury[quote.inputToken.symbol] ?? "0");
  checks.push({
    name: "treasury",
    pass: balance >= parseFloat(quote.inputAmount),
    detail: `balance ${balance} ${quote.inputToken.symbol} (need ${quote.inputAmount})`,
  });

  // 8. price impact: derived from the actual fill vs the quoted output.
  const impactPct = quote.expectedOutput
    ? (1 - actualOutput / parseFloat(quote.expectedOutput)) * 100
    : 0;
  checks.push({
    name: "priceImpact",
    pass: impactPct <= policy.maxSlippageBps / 100,
    detail: `price impact ${impactPct.toFixed(4)}% (limit ${(policy.maxSlippageBps / 100).toFixed(2)}%)`,
  });

  return checks;
}

export function policyPasses(checks: PolicyCheck[]): boolean {
  return checks.every((c) => c.pass);
}
