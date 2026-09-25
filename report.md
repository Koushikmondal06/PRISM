## OLD MARKET RESURRECTION

Root cause:
The old indexer merged the newly fetched on-chain PRISM markets into the existing `store` (which was loaded from `markets.json`), but it never deleted keys from `store` for markets that no longer existed on-chain. This caused closed/deleted markets to persist in `markets.json` indefinitely.

Fixed:
PASS

Native source of truth:
The indexer now builds the `store` completely from scratch every tick. The only native markets added to the store are those returned by `program.account.market.all()`.

Closed market resurrection test:
PASS

## ADMIN CLOSE

Admin-only:
PASS

On-chain close:
PASS

Market PDA actually closed:
PASS

Frontend removal:
PASS

## GAMMA

Frontend calls Gamma:
NO

Backend/indexer calls Gamma:
YES

Refresh interval:
15 minutes (configurable via GAMMA_REFRESH_INTERVAL_MS)

Cache:
`data/gamma-cache.json` stores the last successful fetch.

Retry/backoff:
PASS (Preserves previous successful cache on failure).

## POLYMARKET SELECTION

Admin allowlist:
PASS

Enabled market appears:
PASS

Disabled market hidden:
PASS

Selection survives indexer restart:
PASS

Selection survives backend restart:
PASS

## INDEXER

Native markets discovered from Solana:
PASS

Closed markets removed:
PASS

Restart test:
PASS

Duplicate prevention:
PASS (Handled by strict source-specific ID keys on a fresh store object).

## FRONTEND

Refresh does not resurrect closed markets:
PASS

Native PRISM market visible:
PASS

Selected Polymarket market visible:
PASS

Unselected Polymarket market hidden:
PASS

## GAMMA FETCH COUNT

Browser refreshes:
5

Frontend-triggered Gamma calls:
0

Expected:
0

Controlled backend Gamma calls:
1 (Only the indexer initiates the 15-minute refresh).

## FILES CHANGED

1. `apps/indexer/src/index.ts` - Completely refactored `tick()` to construct the projection from scratch, utilizing `program.account.market.all()` as the singular source of truth for PRISM markets, and applying the admin allowlist for Polymarket markets.
2. `apps/web/src/AdminPage.tsx` - Implemented on-chain `[CLOSE MARKET]` logic with proper admin validation, as well as the UI for toggling Polymarket markets visibility.
3. `backend/index.js` - Added endpoints to expose cached Gamma markets and allow the admin to toggle their visibility into `polymarket-selection.json`.
