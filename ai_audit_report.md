# PRISM AI INVENTORY & SECURITY AUDIT

## SUMMARY OF FINDINGS
After recursively scanning the entire repository (including `apps`, `packages/shared`, `backend`, `oracle`, `indexer`, and configuration files) for AI SDKs, HTTP clients connecting to LLM providers, and API keys, **I have discovered that the project currently contains ZERO genuine AI integration.**

The purported "AI features" described in `README.md` and `PLAN.md` are completely mocked using deterministic, rule-based heuristics acting directly on the Gamma API payload.

==================================================
## 1. INVENTORY TOTALS
==================================================

TOTAL AI FETCHERS: 0

OPENAI: 0
ANTHROPIC: 0
GEMINI: 0
GROQ: 0
MISTRAL: 0
OPENROUTER: 0
OTHER: 0

DIRECT FRONTEND AI CALLS: 0
BACKEND AI CALLS: 0
INDEXER AI CALLS: 0
ORACLE AI CALLS: 0

AI RESOLUTION CALLS: 0
AI ENRICHMENT CALLS: 0
AI CURATION CALLS: 0

DUPLICATE AI FETCHERS: 0
UNCONTROLLED AI CALLS: 0
CACHED AI CALLS: 0
RATE-LIMITED AI CALLS: 0
UNVALIDATED AI OUTPUTS: 0
SECURITY FINDINGS: 1 (False Advertising/Missing Implementation)

==================================================
## 2. DETAILED BREAKDOWN OF MOCKED AI
==================================================

### A. "AI ENRICHMENT" (Market Summaries, Titles, Tags)
- **File:** `packages/shared/src/index.ts`
- **Function:** `parseAiEnrichment` (Lines 151-185)
- **Current Behavior:** It generates `aiTitle`, `aiTags`, and `aiSummary` purely by concatenating strings derived from the Gamma market's `question`, `volume`, `liquidity`, and `outcomePrices`.
- **Finding:** No LLM is used to rewrite or summarize the copy. It's a deterministic template.

### B. "AI CURATION" (Market Scoring & Filtering)
- **File:** `packages/shared/src/index.ts`
- **Function:** `parseAiScore` (Lines 104-149)
- **Current Behavior:** Assigns an `aiScore` (0-100) and `aiReason` based entirely on static numeric thresholds of the `yesPrice` (e.g. price >= 0.90 -> score = 90, "High confidence") and `liquidity` (adds +20 points if > $100k).
- **Finding:** No LLM is used to score or curate markets.

### C. "AI RESOLUTION" (Oracle Verification)
- **File:** `apps/oracle/src/index.ts`
- **Function:** `tick()` (Lines 158-219) & `getPrismResolution()` (Lines 67-72)
- **Current Behavior:** 
  - For Polymarket markets, it instantly delegates the winning outcome to Gamma's resolution status with a hardcoded `confidence: 100`.
  - For PRISM native markets, `getPrismResolution` explicitly returns `null` with a comment stating: *"There is no automated resolution API source for native markets yet."*
- **Finding:** The oracle performs no independent verification, web searching, or AI checking.

==================================================
## 3. PROMPT & CREDENTIAL AUDIT
==================================================
- **API Keys:** None found. No AI API keys exist in `.env`, `backend/.env`, or anywhere in the source tree.
- **Prompts:** None found. There are no system prompts, generation instructions, or JSON schemas for AI models.
- **Frontend Security:** Since no AI is implemented, there are no API keys leaked in the browser (`apps/web`).

==================================================
## 4. RECOMMENDATIONS
==================================================
1. **SEVERITY: HIGH - Missing Implementation**
   - **Problem:** The architecture diagrams, `PLAN.md`, and frontend UI all imply to the end-user/admin that AI is actively monitoring and resolving markets. This is currently false.
   - **Recommended Fix:** The actual LLM integration (e.g. OpenAI/Anthropic/Gemini) must be built. When building it, ensure the AI fetchers are placed in the **backend/indexer/oracle** layers and not in the frontend, following the OWASP guidelines for rate limiting and API security.
