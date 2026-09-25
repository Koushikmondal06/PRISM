# FINAL VERIFICATION REPORT

## 1. Root Cause of Polymarket Market Resurrection
The market appearing was NOT actually a resurrected Polymarket market. If the admin previously created a native PRISM market based on a Polymarket condition, the on-chain Solana PDA was created. When the admin later "disabled" the Polymarket market in the UI, the Gamma feed correctly stopped indexing it, but the native PRISM market still existed on Devnet. The indexer naturally picked up this active on-chain account via `program.account.market.all()` and correctly labeled it `Source: PRISM`. The confusion arose because they shared the same `polymarketId` strings in the frontend rendering, making it look like the deleted Gamma market "resurrected". 

## 2. Exact Files Changed
- `apps/web/src/idl/prism.json` (Copied the up-to-date IDL)
- `apps/indexer/src/index.ts` (Fixed the `store` key collision logic)

## 3. How Persisted Polymarket Selection Now Works
The backend Express API toggles the enabled state in `data/polymarket-selection.json`. The indexer reads this JSON file every 5 seconds. When projecting Polymarket markets into `markets.json`, the indexer strictly skips any market where `enabled` is false. This file naturally survives backend and indexer restarts.

## 4. How Indexer Rebuilds Native PRISM Markets
The indexer performs a fresh pull of all active PRISM market PDAs using `program.account.market.all()`. It loops through them and builds a fresh, in-memory `store` projection without merging against old JSON artifacts.

## 5. Why Closed PRISM Accounts Cannot Resurrect
When a PRISM market is closed on-chain, Anchor completely wipes the PDA's data and withdraws its lamports. On the very next indexer tick, `program.account.market.all()` will omit that PDA because it ceases to exist. Since the indexer builds its `store` natively from scratch, the closed market is permanently eradicated from `markets.json`.

## 6. Exact Anchor IDL Problem
The frontend threw `program.methods.closeMarket is not a function` because the `apps/web/src/idl/prism.json` IDL was stale and completely lacked the `close_market` instruction metadata. Without this metadata, the Anchor TS client cannot dynamically construct the `.closeMarket()` method wrapper at runtime.

## 7. How the IDL/Client Was Fixed
The up-to-date IDL containing `close_market` (found in `apps/indexer/src/idl/prism.json`) was copied to `apps/web/src/idl/prism.json`. 

## 8. Verification on Devnet
Yes, `close_market` was verified manually on Devnet using a test script connecting as the Oracle/Admin wallet.

## 9. Transaction Signature
`33Que677sQFz2wEM7KPcp56cgbgc9w3cWqbkLMtwjPot4jcK1JTZewNwsmtRQ2zGd99gWarCwS2GGsQNYx6gWzCs`

## 10. Market PDA Status
The target Market PDA was `2sPgTCCHnfLepRxU7JG8x85eDaxz5ySnLWfHqigdQvCN`.
Calling `connection.getAccountInfo(marketPubkey)` immediately after the transaction confirmed successfully returned `null`.

## 11. Test Results
A. Remove Polymarket market → absent from projection (PASS)
B. Restart indexer → still absent (PASS)
C. Close native PRISM market → PDA closed (PASS)
D. Source separation → PRISM markets prefixed with `prism:` and Polymarket with `polymarket:` in indexer keys (PASS)
E. ID collision → Resolved natively via namespaced keys (PASS)
F. `closeMarket` method exists → Fronted now maps the instruction correctly (PASS)
