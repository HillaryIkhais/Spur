# MELD — the x402 payment adapter for asset mismatch on Celo

> **Your agent shouldn't need a different treasury for every currency an API accepts.**

**Thesis:** agents pay any compatible x402 service from one Celo stablecoin treasury, automatically
converting into the merchant's required asset (wBRL, wARS, wCOP, cNGN, USDT…) while enforcing
price and slippage limits — deterministically, with no LLM deciding whether the swap is safe.

**Core invariant:** `OUTPUT_AFTER_SWAP ≥ EXACT_X402_AMOUNT` — subject to `maxSlippage`,
`maxTotalCost`, `expiry`, `recipient`, `network`.

## Why this exists

Celo's [x402 facilitator](https://x402.celo.org) accepts multiple assets, but **doesn't convert the
payer's balance into the merchant's required asset** — it settles what you pay. Local stablecoins
(wARS, wBRL, wCOP) are live on the rail. MELD is the **last mile between local-money liquidity
and machine commerce**: 402 → discover asset → quote route → enforce bounds → swap → pay.

Not a marketplace, not an FX router, not a facilitator, not a wallet, not a spending firewall.

## Pipeline (deterministic end to end)

```
PAYMENT REQUIRED (wBRL $0.08, network celo, payTo 0x…)
  ↓ Treasury scan (USDC 12.41, …)
  ↓ Route quote (USDC → wBRL, in 0.0163, out 0.08, min 0.0796)
  ↓ Policy board  8 checks: settleAmount, slippage, totalCost, routeHops,
  ↓                     recipient, network, expiry, treasury, priceImpact
  ↓ SWAP (actual fill recorded)
  ↓ post-fill recheck: actual ≥ required && actual ≥ min
  ↓ x402 PAYMENT → Celo settlement → service result
```

## Run it

```bash
npm install
npm run pb:demo        # happy-path + policy-blocked demos (USDC→wBRL/wARS/cNGN)
npm run pb:attack      # 7/7 adversarial scenarios neutralized
npm run pb:judge       # receipts/meld.html — single-URL audit for judges
npm run pb:commerce    # cross-border commerce product event
```

## Attack lab (7, all executed live against the real enforcer)

| ID | Scenario | Guard |
|----|----------|-------|
| A01 | Deteriorated fill 0.0771 vs required 0.08 | settleAmount invariant |
| A02 | Fill 60bps below quote, 50bps cap | slippage |
| A03 | cNGN treasury vs wBRL merchant | no route |
| A04 | Insufficient balance | treasury |
| A05 | 402 timeout 999s vs 120s policy | expiry |
| A06 | 3% price impact vs 5bps bound | priceImpact |
| A07 | Compromised payer / empty treasury | no tx emitted |

## Guidance from the Celo brief

This targets **wARS / wBRL / wCOP on Celo's x402 facilitator** — the exact stablecoins the
hackathon's Stablecoin Adoption sub-track names. Settlement and swaps are Celo mainnet on-chain
transactions between independent parties. Primary track: **Stablecoin Adoption** (live x402 flows)
with a Real World Adoption secondary. Deadline Sep 14, 09:00 GMT — mainnet only.
