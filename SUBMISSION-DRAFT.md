# SPUR — Submission Draft for Celo Agents at Work 2026

## Project Name
SPUR

## Tagline
x402 lets agents pay. SPUR lets them commit.

## Description
SPUR turns a bounded payment authorization into a first-class economic obligation that can be executed, verified, settled, and optionally financed — without surrendering wallet custody.

The protocol introduces a new primitive: an on-chain economic obligation that binds a buyer's payment authorization to a supplier's delivery commitment, with deterministic verification enforcing the invariant that no settlement occurs without verified delivery.

**Key innovation:** The obligation itself is the cryptographic root. Every subsequent transition — acknowledge, submit, resolve — references this immutable on-chain commitment. The LLM can discover, negotiate, submit, and explain. It cannot mark work verified, release funds, or mutate requirements. The protocol owns those.

## Track
judges-favorite

## Primary Track Rationale
SPUR is a genuinely new economic primitive on Celo that creates enforceable obligations between autonomous agents. It demonstrates how Celo's primitive stack (ERC-8004 identity + x402 payments + stablecoins) can be composed into a novel protocol that enables machine-native economic coordination with built-in verification and settlement guarantees.

## Additional Tracks
- stablecoins-used: SPUR settles via x402 over Celo stablecoins (USDC/USDT)

## Celo Primitive Stack
- **ERC-8004** — Agent identity & trust
- **x402** — Bounded payment authorization
- **SPUR** — Economic obligation layer (this contract)
- **Celo Stablecoins** — Settlement (USDC/USDT)

## Invariants
| ID | Invariant | Enforced in |
|----|-----------|-------------|
| I1 | No settlement beyond the buyer's bounded authorization | `maxAmount` in contract storage |
| I2 | No settlement without the specified delivery being verified | `resolve()` requires `SUBMITTED` status |
| I3 | One settlement per authorization | One-way status transitions |
| I4 | Wrong supplier blocked | `msg.sender == supplier` check |
| I5 | Expired obligation blocked | `block.timestamp > expiry` revert |
| I6 | Verification failure → $0 | `resolve(id, false, ...)` refunds buyer |

## Repository
[TO BE FILLED AFTER GITHUB REPO CREATION]

## Demo
[TO BE FILLED AFTER MAINNET DEPLOYMENT]

## Social Link
[REQUIRES TWITTER/X POST]

## Celo Network
celo-mainnet

## Contract Addresses
[TO BE FILLED AFTER MAINNET DEPLOYMENT]

## Stablecoins and Rails Used
- x402 settlement
- USDC

## Agent Contribution Notes
SPUR was built entirely with AI agent assistance. The agent:
- Designed the protocol architecture and invariant system
- Implemented the SpurObligation.sol smart contract (190 lines)
- Created the agent-facing API (605 lines) with full CRUD operations
- Built the attribution tag integration for hackathon compliance
- Developed the mainnet deployment script with real USDC settlement
- Created comprehensive test coverage (19 on-chain tests)

## Files
- `contracts/SpurObligation.sol` — SPUR contract: obligation lifecycle on-chain
- `contracts/MockERC20.sol` — Testnet stablecoin for demos
- `contracts/ClearSettlement.sol` — v1 escrow (legacy)
- `contracts/ClearObligations.sol` — v2 composable obligations (legacy)
- `scripts/spur-proof.ts` — Live Celo Sepolia proof: success + failure paths
- `scripts/spur-deploy-mainnet.ts` — Celo mainnet deployment script
- `scripts/spur-api.ts` — Agent-facing Express API
- `ui/` — Frontend: landing page, obligation dashboard, demo lab
- `test/` — 19 on-chain tests (7 v1 + 6 v2 + 6 fuzzed invariants)
- `verifier/` — Deterministic verification logic

## How It Works
1. **Buyer authorizes** — signs bounded payment (ERC-8004 identity → x402 authorization)
2. **SPUR creates obligation** — authorization becomes on-chain commitment `SP-XXXX`
3. **Supplier executes** — acknowledges obligation, submits work hash
4. **Verifier checks** — independent deterministic verifier evaluates conditions
5. **Settlement** — satisfied: supplier paid. Rejected: $0, buyer refunded.

## Why This Matters
The missing state between authorization and settlement is a conditional economic obligation. x402 lets agents pay. SPUR lets them commit. This is the missing primitive for machine-native commerce.

## Sponsor Perks
- **Chainstack**: 3 months free Growth plan (20M request units/month, 250 req/s)
- **Cencori**: AI cloud infrastructure with security, observability, and multi-provider model routing
