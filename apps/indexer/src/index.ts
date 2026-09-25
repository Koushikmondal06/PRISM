import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import fs from "node:fs";
import {
  collectBinaryMarkets,
  type StoredMarket,
  type GammaMarket,
  calculateLmsrPrices,
} from "@prism/shared";
import { loadConfig, ensureInitialized } from "./solana.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_DIR = path.resolve(process.env.PRISM_DATA_DIR || path.join(REPO_ROOT, "data"));
const STORE_PATH = path.join(DATA_DIR, "markets.json");
const WEB_MIRROR = path.resolve(
  process.env.WEB_MARKETS_PATH || path.join(REPO_ROOT, "apps/web/public/markets.json")
);
const GAMMA_CACHE_PATH = path.join(DATA_DIR, "gamma-cache.json");
const ADMIN_ALLOWLIST_PATH = path.join(DATA_DIR, "polymarket-selection.json");

const POLL_MS = Number(process.env.INDEXER_POLL_MS || 5000); // Poll indexer frequently
const GAMMA_REFRESH_INTERVAL_MS = Number(process.env.GAMMA_REFRESH_INTERVAL_MS || 15 * 60 * 1000);
const LIMIT_EVENTS = Number(process.env.INDEXER_EVENT_LIMIT || 50);

interface GammaCache {
  lastFetchedAt: number;
  markets: GammaMarket[];
}

function loadAdminAllowlist(): Record<string, { enabled: boolean }> {
  try {
    if (fs.existsSync(ADMIN_ALLOWLIST_PATH)) {
      const data = JSON.parse(fs.readFileSync(ADMIN_ALLOWLIST_PATH, "utf8"));
      return data.markets || {};
    }
  } catch (err) {
    console.error("[indexer] Failed to load admin allowlist:", err);
  }
  return {};
}

function saveStore(store: Record<string, StoredMarket>) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(store, null, 2);
  fs.writeFileSync(STORE_PATH, json);
  try {
    fs.mkdirSync(path.dirname(WEB_MIRROR), { recursive: true });
    fs.writeFileSync(WEB_MIRROR, json);
  } catch (err) {
    console.warn("[indexer] could not mirror markets.json to web public:", err);
  }
}

async function fetchGammaCached(): Promise<GammaMarket[]> {
  let cache: GammaCache = { lastFetchedAt: 0, markets: [] };
  if (fs.existsSync(GAMMA_CACHE_PATH)) {
    try {
      cache = JSON.parse(fs.readFileSync(GAMMA_CACHE_PATH, "utf8"));
    } catch (e) {
      console.error("[indexer] failed to read gamma cache", e);
    }
  }

  const now = Date.now();
  if (now - cache.lastFetchedAt > GAMMA_REFRESH_INTERVAL_MS || cache.markets.length === 0) {
    console.log(`[GAMMA FETCH] timestamp=${new Date().toISOString()} reason=scheduled endpoint=gamma-api number of markets=? duration=?`);
    const start = Date.now();
    try {
      const fetched = await collectBinaryMarkets(LIMIT_EVENTS);
      const duration = Date.now() - start;
      console.log(`[GAMMA FETCH] reason=scheduled markets=${fetched.length} duration=${duration}ms success=true`);
      cache = {
        lastFetchedAt: now,
        markets: fetched,
      };
      fs.writeFileSync(GAMMA_CACHE_PATH, JSON.stringify(cache, null, 2));
    } catch (err) {
      const duration = Date.now() - start;
      console.log(`[GAMMA FETCH] reason=scheduled markets=0 duration=${duration}ms success=false error="${String(err)}"`);
    }
  }
  return cache.markets;
}

async function tick() {
  console.log(`[indexer] sync tick at ${new Date().toISOString()}`);
  const store: Record<string, StoredMarket> = {};

  const cfg = await loadConfig().catch(() => null);

  // STEP 1: Fetch current PRISM Market accounts from Solana
  if (cfg) {
    try {
      const onChainMarkets = await cfg.program.account.market.all();
      for (const onChain of onChainMarkets) {
        const data = onChain.account as any;
        const pubkeyStr = onChain.publicKey.toBase58();
        
        const lmsrB = data.lmsrB ? data.lmsrB.toNumber() : 1_000_000;
        const yesSupply = data.yesSupply ? data.yesSupply.toNumber() : 0;
        const noSupply = data.noSupply ? data.noSupply.toNumber() : 0;
        
        const prices = calculateLmsrPrices(lmsrB, yesSupply, noSupply);
        const priceYesBps = Math.round(prices.yesPrice * 10000);

        // STEP 2: Convert native accounts into source="prism", identity=pubkey
        store[`prism:${pubkeyStr}`] = {
          polymarketId: data.polymarketId || pubkeyStr, // Use actual stored polymarketId
          question: data.question,
          endTs: data.endTs.toNumber(),
          priceYesBps: priceYesBps,
          yesPrice: prices.yesPrice,
          noPrice: prices.noPrice,
          lmsr_b: lmsrB,
          closed: Object.keys(data.status || {})[0]?.toLowerCase() === "resolved",
          winningOutcome: data.winningOutcome !== null ? data.winningOutcome : null,
          aiScore: 50,
          aiReason: "Native market",
          aiTitle: data.question,
          aiTags: ["Yes", "No"],
          aiSummary: "Native PRISM Market",
          raw: data,
          pubkey: pubkeyStr,
          status: Object.keys(data.status || {})[0]?.toLowerCase() as "open" | "frozen" | "resolved",
          createdAt: new Date().toISOString(),
          source: "prism"
        };
      }
    } catch (err) {
      console.error("[indexer] failed to fetch native markets:", err);
    }
  }

  // STEP 3: Load latest successful Gamma cache
  const gammaMarkets = await fetchGammaCached();

  // STEP 4: Apply admin Polymarket allowlist
  const allowlist = loadAdminAllowlist();

  for (const gm of gammaMarkets) {
    if (!gm.active || gm.closed) continue; // Only active/open Gamma markets
    const config = allowlist[gm.polymarketId];
    if (config && config.enabled) {
      // STEP 5: Convert enabled Gamma markets into source="polymarket", identity=conditionId
      store[`polymarket:${gm.polymarketId}`] = {
        ...gm,
        status: "open",
        closed: false,
        pubkey: undefined, // no native PDA for polymarket markets
        source: "polymarket",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // STEP 6 & 7 & 8: Merge, Deduplicate (by setting map keys), Write Projection
  saveStore(store);
  console.log(`[indexer] sync completed. Total markets projected: ${Object.keys(store).length}`);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const once = process.argv.includes("--once");

  await tick();
  if (once) return;

  console.log(`[indexer] polling every ${POLL_MS}ms`);
  setInterval(() => {
    tick().catch((err) => console.error("[indexer] tick error", err));
  }, POLL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
