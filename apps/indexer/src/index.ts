import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import fs from "node:fs";
import express from "express";
import cors from "cors";
import {
  collectBinaryMarkets,
  type StoredMarket,
  type CuratedMarket,
  calculateLmsrPrices,
} from "@prism/shared";
import { loadConfig } from "./solana.js";
import pg from "pg";

// Uncaught Error Handlers
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled Rejection at:", promise, "reason:", reason);
});

// Environment Configuration Validation
if (!process.env.DATABASE_URL) {
  console.error("[FATAL] DATABASE_URL is missing. Exiting.");
  process.exit(1);
}
if (!process.env.SOLANA_RPC_URL) {
  console.error("[FATAL] SOLANA_RPC_URL is missing. Exiting.");
  process.exit(1);
}

// PostgreSQL Connection Pool
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.DATABASE_POOL_MAX || 5),
});

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_DIR = path.resolve(process.env.PRISM_DATA_DIR || path.join(REPO_ROOT, "data"));
const MARKETS_JSON_PATH = path.resolve(process.env.MARKETS_JSON_PATH || path.join(DATA_DIR, "markets.json"));
const POLYMARKET_SELECTION_PATH = path.resolve(process.env.POLYMARKET_SELECTION_PATH || path.join(DATA_DIR, "polymarket-selection.json"));
const GAMMA_CACHE_PATH = path.resolve(process.env.GAMMA_CACHE_PATH || path.join(DATA_DIR, "gamma-cache.json"));

const POLL_MS = Number(process.env.INDEXER_POLL_MS || 5000);
const GAMMA_REFRESH_INTERVAL_MS = Number(process.env.GAMMA_REFRESH_INTERVAL_MS || 15 * 60 * 1000);
const LIMIT_EVENTS = Number(process.env.INDEXER_EVENT_LIMIT || 50);

interface GammaCache {
  lastFetchedAt: number;
  markets: CuratedMarket[];
}

let isSyncRunning = false;
let isReady = false;
let currentProjection: Record<string, StoredMarket> = {};
let server: any = null;
let timer: NodeJS.Timeout | null = null;

function loadAdminAllowlist(): Record<string, { enabled: boolean }> {
  try {
    if (fs.existsSync(POLYMARKET_SELECTION_PATH)) {
      const data = JSON.parse(fs.readFileSync(POLYMARKET_SELECTION_PATH, "utf8"));
      return data.markets || {};
    }
  } catch (err) {
    console.error("[indexer] Failed to load admin allowlist:", err);
  }
  return {};
}

function saveStore(store: Record<string, StoredMarket>) {
  fs.mkdirSync(path.dirname(MARKETS_JSON_PATH), { recursive: true });
  const json = JSON.stringify(store, null, 2);
  const tmpPath = `${MARKETS_JSON_PATH}.tmp`;
  fs.writeFileSync(tmpPath, json);
  fs.renameSync(tmpPath, MARKETS_JSON_PATH);
  
  // Update in-memory projection for endpoints
  currentProjection = store;
}

async function fetchGammaCached(): Promise<CuratedMarket[]> {
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
    console.log(`[GAMMA FETCH] timestamp=${new Date().toISOString()} reason=scheduled`);
    const start = Date.now();
    try {
      const fetched = await collectBinaryMarkets(LIMIT_EVENTS);
      const duration = Date.now() - start;
      console.log(`[GAMMA FETCH] markets=${fetched.length} duration=${duration}ms success=true`);
      cache = { lastFetchedAt: now, markets: fetched };
      fs.mkdirSync(path.dirname(GAMMA_CACHE_PATH), { recursive: true });
      fs.writeFileSync(GAMMA_CACHE_PATH, JSON.stringify(cache, null, 2));
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`[GAMMA FETCH] markets=0 duration=${duration}ms success=false error="${String(err)}"`);
    }
  }
  return cache.markets;
}

async function persistToDb(store: Record<string, StoredMarket>) {
  const now = new Date();
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    
    for (const [key, market] of Object.entries(store)) {
      const source = market.source;
      const source_market_id = source === 'prism' ? market.pubkey : market.polymarketId;
      if (!source || !source_market_id) continue;

      await client.query(`
        INSERT INTO market_projection (source, source_market_id, data, active, updated_at)
        VALUES ($1, $2, $3, true, $4)
        ON CONFLICT (source, source_market_id) DO UPDATE SET
          data = EXCLUDED.data,
          active = true,
          updated_at = EXCLUDED.updated_at
      `, [source, source_market_id, JSON.stringify(market), now]);
    }
    
    await client.query(`
      UPDATE market_projection 
      SET active = false, updated_at = $1 
      WHERE active = true AND updated_at < $1
    `, [now]);
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("[indexer] Failed to persist to PostgreSQL:", err);
  } finally {
    client.release();
  }
}

async function tick() {
  if (isSyncRunning) return;
  isSyncRunning = true;
  
  try {
    const store: Record<string, StoredMarket> = {};
    let solanaFailed = false;
    const cfg = await loadConfig().catch((err) => {
      console.error("[indexer] RPC failure loading config:", err.message);
      return null;
    });

    if (cfg) {
      try {
        const onChainMarkets = await (cfg.program.account as any).market.all();
        for (const onChain of onChainMarkets) {
          const data = onChain.account as any;
          const pubkeyStr = onChain.publicKey.toBase58();
          
          const lmsrB = data.lmsrB ? data.lmsrB.toNumber() : 1_000_000;
          const yesSupply = data.yesSupply ? data.yesSupply.toNumber() : 0;
          const noSupply = data.noSupply ? data.noSupply.toNumber() : 0;
          
          const prices = calculateLmsrPrices(lmsrB, yesSupply, noSupply);
          const priceYesBps = Math.round(prices.yesPrice * 10000);

          store[`prism:${pubkeyStr}`] = {
            polymarketId: data.polymarketId || pubkeyStr,
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
        solanaFailed = true;
      }
    } else {
      solanaFailed = true;
    }

    if (solanaFailed) {
      // Restore previous native markets
      for (const [key, m] of Object.entries(currentProjection)) {
        if (m.source === "prism") {
          store[key] = m;
        }
      }
    }

    const gammaMarkets = await fetchGammaCached();
    const allowlist = loadAdminAllowlist();

    for (const gm of gammaMarkets) {
      if (gm.closed) continue; // Note: active boolean might not be in CuratedMarket, just closed
      const config = allowlist[gm.polymarketId];
      if (config && config.enabled) {
        store[`polymarket:${gm.polymarketId}`] = {
          ...gm,
          status: "open",
          closed: false,
          pubkey: undefined,
          source: "polymarket",
          createdAt: new Date().toISOString(),
        } as unknown as StoredMarket;
      }
    }

    saveStore(store);
    await persistToDb(store);
    
    isReady = true;
    console.log(`[INFO] Solana sync completed markets=${Object.keys(store).length}`);
  } finally {
    isSyncRunning = false;
  }
}

// HTTP Server setup
const app = express();
const origin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "prism-indexer", timestamp: new Date().toISOString() });
});

app.get("/ready", (req, res) => {
  if (isReady) res.status(200).json({ ready: true });
  else res.status(503).json({ ready: false });
});

app.get("/markets.json", (req, res) => {
  res.json(currentProjection);
});

app.get("/api/admin/gamma", async (req, res) => {
  try {
    const markets = await fetchGammaCached();
    const allowlist = loadAdminAllowlist();
    const withState = markets.map(m => ({
      ...m,
      enabled: allowlist[m.polymarketId]?.enabled || false
    }));
    res.json(withState);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/gamma/toggle", (req, res) => {
  try {
    const { polymarketId, enabled } = req.body;
    const allowlist = loadAdminAllowlist();
    allowlist[polymarketId] = { enabled };
    
    fs.mkdirSync(path.dirname(POLYMARKET_SELECTION_PATH), { recursive: true });
    const tmpPath = `${POLYMARKET_SELECTION_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify({ markets: allowlist }, null, 2));
    fs.renameSync(tmpPath, POLYMARKET_SELECTION_PATH);
    
    res.json({ success: true, polymarketId, enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const once = process.argv.includes("--once");

  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS market_projection (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        source_market_id TEXT NOT NULL,
        data JSONB NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(source, source_market_id)
      );
    `);
    await pgPool.query('SELECT NOW()');
    console.log("[INFO] database connected");
  } catch (err) {
    console.error("[FATAL] database unavailable:", err);
    process.exit(1);
  }

  await tick();
  if (once) {
    await pgPool.end();
    process.exit(0);
  }

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";
  
  server = app.listen(Number(port), host, () => {
    console.log(`[INFO] indexer started on ${host}:${port}`);
  });

  timer = setInterval(() => {
    tick().catch((err) => console.error("[ERROR] tick error", err));
  }, POLL_MS);
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n[INFO] Received ${signal}, initiating graceful shutdown...`);
  if (timer) clearInterval(timer);
  
  // Wait for tick to finish
  const waitSync = async () => {
    while (isSyncRunning) {
      await new Promise(r => setTimeout(r, 100));
    }
  };
  await waitSync();

  if (server) {
    server.close(() => console.log("[INFO] HTTP server closed"));
  }
  
  await pgPool.end();
  console.log("[INFO] PostgreSQL pool closed");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err) => {
  console.error("[FATAL] Main process crashed:", err);
  process.exit(1);
});
