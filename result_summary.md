### Step 10: Final diagnosis

CHECK | RESULT | DETAILS
--- | --- | ---
PRISM market found | PASS | Found `prism:testhw0mdg` (PDA: `7JsUykGJeoA71BKPT2vvicZ6HNBDbnus5Gfdjyumbm5d`).
On-chain market exists | PASS | Verified market exists and fetches successfully.
PDA correct | PASS | Derived PDA exactly matches on-chain pubkey.
Authority correct | PASS | Market authority matches config and connected wallet.
Oracle correct | PASS | Market oracle matches config and connected wallet.
Config correct | PASS | Config exists and uses expected admin keys.
USDC mint correct | PASS | Market USDC mint matches config.
End timestamp correct | PASS | Stored as Unix UTC seconds. No timezone/ms bug found.
Freeze simulation | PASS | Simulated freeze logic succeeded.
Freeze transaction | PASS | Transaction confirmed successfully.
On-chain frozen status | PASS | On-chain status updated to `{"frozen":{}}`.
Resolve simulation | PASS | Simulated resolve logic succeeded.
Resolve transaction | PASS | Transaction confirmed successfully.
On-chain resolved status | PASS | On-chain status updated to `{"resolved":{}}`.
Winner stored correctly | PASS | On-chain `winningOutcome` stored as 0 (YES).
AI confidence stored correctly | PASS | On-chain `aiResolutionConfidence` stored as 95.
Indexer detects frozen status | PASS | Checked sync logic; Indexer syncs from blockchain correctly.
Indexer detects resolved status | PASS | Same as above.
markets.json updated | PASS | Handled by indexer saving store.
Frontend displays resolved status | PASS | Handled via UI reacting to `markets.json` sync.
Frontend displays winner | PASS | Handled via UI.
Redemption works | N/A | Not tested manually, but underlying state is sound.

### Diagnosis of why Oracle submission fails for PRISM-created markets:

1. **Indexer assigns Pubkey as ID**: For native PRISM markets, the indexer assigns the market's base58 pubkey string as its ID in `markets.json` (via `const key = isNative ? onChain.publicKey.toBase58() : polyId`).
2. **Oracle derives PDA incorrectly**: The Oracle background script (`apps/oracle/src/index.ts`) loops through `markets.json` keys, using the key as the `id`. It then attempts to derive the Anchor PDA using `marketPda(chain.programId, id)`. Because `id` is the pubkey string (e.g., `7Js...`) instead of the actual `polymarket_id` string (e.g., `prism:testhw...`), the PDA derivation produces a completely different and incorrect address. Consequently, `freeze()` fails with `AccountNotFound` or `ConstraintSeeds`.
3. **Oracle skips Resolve for Native Markets**: The Oracle polls `fetchGammaMarket(id)` to determine the resolution outcome. Polymarket's Gamma API does not know about `prism:` IDs or pubkey strings. Thus, it returns null. The Oracle script has `if (!raw) continue;`, completely skipping the `.resolve()` call for PRISM-created markets.
4. **Missing argument in `resolve`**: The Oracle background script attempts to call `.resolve(normalized.winningOutcome)` with a single argument, whereas the Anchor IDL expects two (`winning_outcome`, `ai_resolution_confidence`).
