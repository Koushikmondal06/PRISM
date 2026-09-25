# Phase 1: Fix Indexer Tick
1. Remove automatic `createMarketOnChain` from indexer, or keep it ONLY for markets that are `enabled` in `polymarket-selection.json`?
Wait, the prompt says:
"The indexer must perform:
STEP 1: Fetch current PRISM Market accounts from Solana.
STEP 2: Convert native accounts into: source = "prism", identity = pubkey
STEP 3: Load latest successful Gamma cache.
STEP 4: Apply admin Polymarket allowlist.
STEP 5: Convert enabled Gamma markets into: source = "polymarket", identity = conditionId
STEP 6: Merge both datasets.
STEP 7: Deduplicate using source-specific identity.
STEP 8: Write the generated market projection."

This means Polymarket markets are JUST data in the JSON. They are not necessarily native on-chain!
Wait, if they are not on-chain, how does PRISM trade them? Or maybe they ARE traded on Polymarket (Polygon), and PRISM just shows them?
The prompt says: "Convert enabled Gamma markets into: source = "polymarket", identity = conditionId". So they stay as Polymarket markets.

Let's check `apps/indexer/src/index.ts` again to see what it does with Gamma markets.
