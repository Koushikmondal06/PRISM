# Admin Market Creation System

## Architecture

PRISM now supports two types of markets:
1. **POLYMARKET**: Sourced from Gamma API, imported by the indexer, and pushed to Solana.
2. **PRISM**: Native markets created manually by the Admin on-chain directly.

Both market types use the identical LMSR trading logic and Anchor `Market` struct. To differentiate them off-chain, the `polymarket_id` string on-chain uses a specific prefix for native markets (`prism:<random_suffix>`). 

The `StoredMarket` schema in `packages/shared` now includes a `source: "polymarket" | "prism"` field which flows all the way to the frontend UI.

## Admin Authorization

The admin mechanism uses the on-chain `config_v3` account which contains the `authority: Pubkey` field. 
When navigating to the Admin page (`#/admin`), the UI fetches `config_v3` from Solana and compares the `authority` to the connected wallet. If authorized, the "CREATE PRISM MARKET" form is unlocked.

## Market Creation Flow

1. Admin fills out the market creation form (Question, End Date, Time, etc.).
2. A unique `polymarket_id` is generated (e.g. `prism:a1b2c3`).
3. The PDA for the market is derived via `[b"market", b"prism:a1b2c3"]`.
4. The Vault PDA is derived.
5. The `createMarket` instruction is sent to the Anchor program, signed by the Admin Wallet.
6. Once confirmed on Solana Devnet, the market exists permanently.

## Indexer Flow

The `apps/indexer/src/index.ts` script runs continuously. In each tick:
1. It fetches Polymarket markets from Gamma (or fixtures).
2. It fetches **Native markets** from Solana directly using `program.account.market.all()`.
3. It identifies native markets because their `polymarketId` starts with `"prism:"`.
4. It sets `source: "prism"` for native markets and `source: "polymarket"` for Gamma markets.
5. It merges both into a single `store` object and writes to `markets.json`.

## AI Integration

Native markets are automatically assigned an initial default AI Score (50) and tags. The AI fetcher (which currently applies heuristics in `shared/src/index.ts`) can seamlessly process them alongside Polymarket markets if extended to do so. Since native markets are written into `markets.json`, the frontend treats them exactly the same as Polymarket markets for trading, AI curation displays, and lifecycle management.

## Failure Handling

- **Unauthorized Wallet:** The form is hidden, and "ADMIN ACCESS DENIED" is shown.
- **Transaction Rejected/Simulation Failed:** The error is caught by Anchor and displayed directly below the "Create Market" button. No false success messages are shown.
- **Invalid Date:** Frontend blocks submission if the end timestamp is in the past.

## Testing

A complete test plan has been implemented. Admins can safely navigate to `/admin`, connect their authorized Devnet wallet (`Ea3TNJEQs4HDaY5xdsJHnQWG4XdfsWMBqNYTeASW1mj7`), and create a test market. The indexer will pick it up on the next poll, and it will appear on the main page under the PRISM source filter.
