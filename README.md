# PRISM — AI-Curated Solana Prediction Markets

PRISM is a decentralized prediction market platform built on Solana. It leverages AI for market curation, enrichment, and resolution sanity checks, and uses an automated market maker (LMSR) for liquidity.

## Quickstart (Devnet)

**Prerequisites:** Node 20+, Rust, Solana CLI, Anchor CLI 0.30.1.

```bash
# 1. Install dependencies
npm install

# 2. Build the Anchor program
anchor build

# 3. Deploy to Devnet (requires SOL on your devnet keypair)
solana program deploy target/deploy/prism.so \
  --program-id target/deploy/prism-keypair.json

# 4. Copy the new Program ID to Anchor.toml, lib.rs, and apps/web/src/lib/transactions.ts
# 5. Build the workspace packages
npm run build -w @prism/shared
npm run build -w @prism/indexer
npm run build -w @prism/oracle

# 6. Run the Indexer (fetches event data and initializes markets)
DRY_RUN=1 USE_FIXTURES=1 PRISM_DATA_DIR=./data npm run once -w @prism/indexer
DRY_RUN=0 USE_FIXTURES=1 PRISM_DATA_DIR=./data USDC_MINT=<mint> npm run once -w @prism/indexer

# 7. Run the Oracle (checks for resolutions and submits on-chain)
DRY_RUN=0 PRISM_DATA_DIR=./data npm run once -w @prism/oracle

# 8. Start the Trading UI
npm run dev -w @prism/web
```

---

## Architecture Overview

Workspace: `programs/prism` · `apps/indexer` · `apps/oracle` · `apps/web` · `packages/shared`

1. **Indexer** scans external event data sources.
2. **AI Curation** scores the incoming events for ambiguity/risk. Low-score events are dropped.
3. **AI Enrichment** rewrites the raw data into punchier UI copy, generates a summary, and assigns a category tag.
4. **Market Creation** — the indexer initializes the Anchor program with the new market and its parameters.
5. **Trading** — users buy/sell outcome shares against an LMSR bonding curve.
6. **Freeze** — trading halts at the expected `end_date`, *before* resolution is known, to prevent front-running the outcome.
7. **Oracle** detects the external resolution and passes it to the AI sanity-check.
8. **AI resolution sanity-check** — a web-search-backed confidence check on the claimed outcome. High confidence auto-submits; low confidence routes to human review.
9. **On-chain settlement** — the oracle signs and submits the outcome; the program marks the market resolved.
10. **Payout** — winning shares redeem 1:1 for USDC; losing shares burn to zero.

---

## Components

| Layer | What it is | Tech |
|---|---|---|
| Indexer | Cron/worker polling for events | Node service (`apps/indexer`) |
| AI curation | LLM scoring + filtering | Claude API, batched |
| AI enrichment | LLM rewriting copy | Claude API, cached |
| Market creation | On-chain program instruction | Anchor (Rust) |
| Liquidity/pricing | LMSR automated market maker | On-chain |
| Trading UI | Frontend for buy/sell | React + wallet adapter (`apps/web`) |
| Freeze logic | Time-based trading halt | On-chain, keyed to `end_date` |
| Oracle | Backend service + signer | Node (`apps/oracle`) |
| AI resolution check | LLM + web search verification | Node |
| Settlement/payout | On-chain redemption logic | Anchor (Rust) |

---

## Liquidity: LMSR Market Maker

LMSR (Logarithmic Market Scoring Rule) — the classic Hanson automated market maker for prediction markets.

**Cost function:**
```
C(q) = b * ln(e^(q_yes/b) + e^(q_no/b))
```

**Price of an outcome:**
```
price_yes = e^(q_yes/b) / (e^(q_yes/b) + e^(q_no/b))
```

**Cost to buy Δ shares of YES:**
```
cost = C(q_yes + Δ, q_no) - C(q_yes, q_no)
```

**Liquidity parameter `b`:** controls slippage/depth. Also bounds your maximum possible loss to `b * ln(n)` (for binary markets, `≈ 0.693 * b`). Set `b` based on how much capital you're willing to risk per market.

**On-chain implementation notes:**
- `exp`/`ln` are expensive and numerically unstable in fixed-point — we use the log-sum-exp trick to keep exponents near zero: subtract `max(q_yes, q_no)/b` before exponentiating.

---

## AI Fetchers

Three distinct jobs, not one generic "AI fetcher":

### 1. Curation Fetcher
Scores incoming markets for quality/ambiguity/risk before you bother creating them on-chain.

### 2. Enrichment Fetcher
Rewrites raw event questions/descriptions into punchier UI copy, assigns a category tag. Runs once per market, cached — not on every poll cycle.

### 3. Resolution Sanity-Check Fetcher
Runs when the oracle detects a resolution, **before** payout triggers. Uses web search to independently verify the claimed outcome against current news.
- High confidence -> auto-submit on-chain
- Low confidence  -> human review queue, payout stays frozen

---

## Oracle & Settlement

- Oracle service polls event data for `closed=true` + resolved outcome on markets you're tracking.
- Passes the claimed outcome through the AI sanity-check.
- Signs and submits the outcome to the Anchor program using a Solana keypair.
- Program marks the market resolved and opens redemption.
- Users redeem winning shares 1:1 for USDC; losing shares burn to zero.

**Critical timing rule:** freeze trading on your market at the `end_date`, *not* when resolution is confirmed. There's a real gap between "market should be closed" and "outcome is known" — anyone with early knowledge of the real-world outcome can trade against your stale price in that window if you don't freeze early.

---

## Trust Boundaries & Risks

1. **Indexer misreads** — AI curation/enrichment reduce noise but aren't money-critical. Worst case: a bad title, not a bad payout.
2. **Oracle centralization** — a single backend signer submitting truth on-chain is a single point of failure. Fine for an MVP; longer-term, move to a multisig oracle committee or a dispute/challenge window before payout finalizes.
3. **Freeze-timing gap** — front-running risk between market end and resolution submission. Mitigated by freezing early (see above).
