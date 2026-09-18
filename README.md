# SPUR — Machine-Native Economic Obligations for Autonomous Agents

> x402 lets agents pay. SPUR lets them commit.

SPUR turns a bounded payment authorization into a first-class economic obligation that can be executed, verified, settled, and optionally financed — without surrendering wallet custody.

**WATCH THE ATTACK:** `npx tsx scripts/spur-proof.ts` — success path settles, failure path blocks. Real Celo Sepolia transactions.

**The one invariant:** No settlement without verification. No settlement beyond authorization.

## How it works

1. **Buyer authorizes** — signs bounded payment (ERC-8004 identity → x402 authorization)
2. **SPUR creates obligation** — authorization becomes on-chain commitment `SP-XXXX`
3. **Supplier executes** — acknowledges obligation, submits work hash
4. **Verifier checks** — independent deterministic verifier evaluates conditions
5. **Settlement** — satisfied: supplier paid. Rejected: $0, buyer refunded.

The LLM can discover, negotiate, submit, and explain. It **cannot** mark work verified, release funds, or mutate requirements. The protocol owns those.

## Celo Primitive Stack

- **ERC-8004** — Agent identity & trust
- **x402** — Bounded payment authorization
- **SPUR** — Economic obligation layer (this contract)
- **Celo Stablecoins** — Settlement (cUSD, USDC)

## Invariants

| ID | Invariant | Enforced in |
|----|-----------|-------------|
| I1 | Settlement ≤ authorized ceiling | `maxAmount` in contract storage |
| I2 | No settlement without verification | `resolve()` requires `SUBMITTED` status |
| I3 | One settlement per authorization | One-way status transitions |
| I4 | Wrong supplier blocked | `msg.sender == supplier` check |
| I5 | Expired obligation blocked | `block.timestamp > expiry` revert |
| I6 | Verification failure → $0 | `resolve(id, false, ...)` refunds buyer |

## Run the live proof

```bash
# Compile contracts
forge build

# Run live proof on Celo Sepolia
npx tsx scripts/spur-proof.ts

# With a funded wallet to auto-fund demo wallets
FUNDER_PRIVATE_KEY=0x... npx tsx scripts/spur-proof.ts
```

## Agent-Facing API

SPUR is consumed by agents, not humans. The API is the distribution channel.

```bash
# After deploying with spur-proof.ts, set env vars:
export SPUR_CONTRACT=0x...
export SPUR_TOKEN=0x...
export SPUR_VERIFIER_KEY=0x...
export BUYER_PRIVATE_KEY=0x...
export SUPPLIER_PRIVATE_KEY=0x...

# Start the API
npx tsx scripts/spur-api.ts
```

### Endpoints

```
GET  /health                          — Health check
POST /obligations                     — Create obligation (buyer agent)
GET  /obligations                     — List all obligations
GET  /obligations/:id                 — Query obligation state
POST /obligations/:id/ack             — Supplier acknowledges
POST /obligations/:id/submit          — Supplier submits work
POST /obligations/:id/resolve         — Verifier settles or rejects
```

### Example: Agent creates obligation

```bash
curl -X POST http://localhost:3004/obligations \
  -H "Content-Type: application/json" \
  -d '{
    "buyer": "0x30D936CE25dcc40604AC51c1F8EF4BAaf82C762e",
    "supplier": "0x904e6870e11e814a6cB49A353e52B213f39AE02b",
    "maxAmount": "0.42",
    "expirySeconds": 3600,
    "task": "FX_REPORT_1042",
    "condition": "report_hash = H(timestamp, source, usd_ngn, confidence), freshness < 300s"
  }'
```

## Repo map

- `contracts/SpurObligation.sol` — SPUR contract: obligation lifecycle on-chain
- `contracts/MockERC20.sol` — Testnet stablecoin for demos
- `contracts/ClearSettlement.sol` — v1 escrow (legacy)
- `contracts/ClearObligations.sol` — v2 composable obligations (legacy)
- `scripts/spur-proof.ts` — Live Celo Sepolia proof: success + failure paths
- `ui/` — Frontend: landing page, obligation dashboard, demo lab
- `test/` — 19 on-chain tests (7 v1 + 6 v2 + 6 fuzzed invariants)
- `verifier/` — Deterministic verification logic
