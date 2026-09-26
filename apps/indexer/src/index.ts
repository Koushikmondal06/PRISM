import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import fs from "node:fs";
import express from "express";
import cors from "cors";
import {
  collectBinaryMarkets,
  collectActiveBinaryMarkets,
  type StoredMarket,
  type CuratedMarket,
  calculateLmsrPrices,
} from "@prism/shared";
import { loadConfig, createMarketOnChain, freezeMarketOnChain } from "./solana.js";
import pg from "pg";
import { tigerdb } from "./db/tigerdb.js";

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

const ADMIN_CONFIG_PATH = path.join(DATA_DIR, "admin-config.json");

function loadAdminConfig(): any {
  if (fs.existsSync(ADMIN_CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(ADMIN_CONFIG_PATH, "utf8"));
    } catch (e) {
      console.error("[indexer] failed to load admin config", e);
    }
  }
  return {};
}

function saveAdminConfig(config: any) {
  fs.mkdirSync(path.dirname(ADMIN_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(config, null, 2));
}

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

async function fetchGammaCached(forceRefresh = false): Promise<CuratedMarket[]> {
  let cache: GammaCache = { lastFetchedAt: 0, markets: [] };
  if (fs.existsSync(GAMMA_CACHE_PATH)) {
    try {
      cache = JSON.parse(fs.readFileSync(GAMMA_CACHE_PATH, "utf8"));
    } catch (e) {
      console.error("[indexer] failed to read gamma cache", e);
    }
  }

  const now = Date.now();
  if (forceRefresh || now - cache.lastFetchedAt > GAMMA_REFRESH_INTERVAL_MS || cache.markets.length === 0) {
    console.log(`[GAMMA FETCH] timestamp=${new Date().toISOString()} reason=${forceRefresh ? 'manual' : 'scheduled'}`);
    const start = Date.now();
    try {
      const fetched = await collectActiveBinaryMarkets(100);
      const duration = Date.now() - start;
      console.log(`[GAMMA FETCH] markets=${fetched.length} duration=${duration}ms success=true`);
      cache = { lastFetchedAt: now, markets: fetched };
      fs.mkdirSync(path.dirname(GAMMA_CACHE_PATH), { recursive: true });
      fs.writeFileSync(GAMMA_CACHE_PATH, JSON.stringify(cache, null, 2));
      
      const adminConfig = loadAdminConfig();
      adminConfig.lastGammaFetchTs = now;
      adminConfig.lastGammaFetchCount = fetched.length;
      saveAdminConfig(adminConfig);
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`[GAMMA FETCH] Fetch failed markets=0 duration=${duration}ms success=false error="${String(err)}"`);
      console.log(`[GAMMA FETCH] Using cached markets`);
      if (forceRefresh) throw err;
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

    // We no longer automatically import all Gamma markets.
    // They must be manually activated via the Admin UI.

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

const requireAdmin = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const adminSecret = process.env.ADMIN_SECRET || "prism-admin-secret";
  if (authHeader === `Bearer ${adminSecret}`) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

app.get("/health", async (req, res) => {
  let tigerdbStatus = "ok";
  try {
    await tigerdb.query("SELECT 1");
  } catch {
    tigerdbStatus = "error";
  }
  res.json({ status: "ok", service: "prism-indexer", tigerdb: tigerdbStatus, timestamp: new Date().toISOString() });
});

app.get("/ready", async (req, res) => {
  let tigerReady = true;
  try {
    await tigerdb.query("SELECT 1");
  } catch {
    tigerReady = false;
  }
  if (isReady) res.status(200).json({ ready: true, tigerdb: tigerReady });
  else res.status(503).json({ ready: false, tigerdb: tigerReady });
});

app.get("/markets.json", (req, res) => {
  res.json(currentProjection);
});

app.get("/api/admin/gamma", async (req, res) => {
  try {
    const markets = await fetchGammaCached();
    // Return them straight away.
    // We can also augment them with their PRISM state if found in currentProjection
    const mapped = markets.map(m => {
      const prismId = `polymarket:${m.polymarketId}`;
      const found = currentProjection[prismId];
      return {
        ...m,
        prismStatus: found ? found.status : "imported",
        prismMarketPubkey: found?.pubkey || undefined,
      };
    });
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/markets/:polymarketId/activate", requireAdmin, async (req, res) => {
  try {
    const { polymarketId } = req.params;
    
    const adminConfig = loadAdminConfig();
    const globalPrismEndTs = adminConfig.globalPrismEndTs;
    if (!globalPrismEndTs) {
      return res.status(400).json({ error: "Global PRISM market end date is not configured" });
    }
    if (globalPrismEndTs <= Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: "PRISM market end date must be in the future" });
    }

    const markets = await fetchGammaCached();
    const market = markets.find(m => m.polymarketId === polymarketId);
    if (!market) {
      return res.status(404).json({ error: "Market not found in Gamma cache" });
    }

    if (currentProjection[`polymarket:${polymarketId}`]) {
      return res.json({ 
        success: true, 
        polymarketId, 
        prismMarketPubkey: currentProjection[`polymarket:${polymarketId}`].pubkey,
        status: "live",
        message: "Already active"
      });
    }

    const cfg = await loadConfig();
    
    // Store gamma end ts explicitly and use global prism end ts
    const gammaEndTs = market.endTs;
    market.endTs = globalPrismEndTs;
    
    // 50/50 starting point via 5000 bps
    market.priceYesBps = 5000;
    const pubkey = await createMarketOnChain(cfg, market);

    const stored: StoredMarket = {
      ...market,
      source: "polymarket",
      pubkey,
      status: "open",
      createdAt: new Date().toISOString(),
      raw: {
        ...market.raw,
        gammaEndTs,
        prismEndTs: globalPrismEndTs,
      }
    } as any;

    currentProjection[`polymarket:${polymarketId}`] = stored;
    saveStore(currentProjection);
    await persistToDb(currentProjection);

    res.json({
      success: true,
      polymarketId,
      prismMarketPubkey: pubkey,
      status: "live"
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/markets/:prismMarketId/stop", requireAdmin, async (req, res) => {
  try {
    const { prismMarketId } = req.params;
    let foundKey: string | null = null;
    let foundMarket: StoredMarket | null = null;
    
    for (const [k, v] of Object.entries(currentProjection)) {
      if (v.pubkey === prismMarketId) {
        foundKey = k;
        foundMarket = v;
        break;
      }
    }

    if (!foundKey || !foundMarket) {
      return res.status(404).json({ error: "Market not found" });
    }

    if (foundMarket.status !== "open") {
      return res.status(400).json({ error: `Market is ${foundMarket.status}, cannot stop` });
    }

    const cfg = await loadConfig();
    await freezeMarketOnChain(cfg, prismMarketId);

    foundMarket.status = "frozen";
    currentProjection[foundKey] = foundMarket;
    saveStore(currentProjection);
    await persistToDb(currentProjection);

    res.json({
      success: true,
      prismMarketPubkey: prismMarketId,
      status: "frozen"
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/config", requireAdmin, (req, res) => {
  try {
    const adminConfig = loadAdminConfig();
    res.json(adminConfig);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/config/prism-end-date", requireAdmin, (req, res) => {
  try {
    const { prismEndTs } = req.body;
    const adminConfig = loadAdminConfig();
    adminConfig.globalPrismEndTs = prismEndTs;
    saveAdminConfig(adminConfig);
    res.json({ success: true, prismEndTs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/gamma/fetch", requireAdmin, async (req, res) => {
  try {
    const start = Date.now();
    const fetched = await fetchGammaCached(true);
    res.json({
      success: true,
      fetched: fetched.length,
      updated: fetched.length,
      new: fetched.length, // approximation for UI
      timestamp: new Date().toISOString(),
      source: "polymarket-gamma",
      duration: Date.now() - start
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Comments API
app.get("/api/markets/:marketId/comments", async (req, res) => {
  try {
    const { marketId } = req.params;
    const limit = 200;
    const query = `
      SELECT id, prism_market_id, polymarket_id, username, wallet_address, message, created_at
      FROM market_comments
      WHERE prism_market_id = $1 AND is_deleted = FALSE
      ORDER BY created_at ASC
      LIMIT $2;
    `;
    const result = await tigerdb.query(query, [marketId, limit]);
    res.json({ comments: result.rows });
  } catch (err: any) {
    console.error("[tigerdb] fetch comments error:", err.message);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

const commentsRateLimits = new Map<string, number[]>();

app.post("/api/markets/:marketId/comments", async (req, res) => {
  try {
    const { marketId } = req.params;
    let { username, message, walletAddress } = req.body;

    if (!username || typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ error: "Username is required" });
    }
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: "Message is required" });
    }
    
    username = username.trim().substring(0, 64);
    message = message.trim().substring(0, 2000);
    const wAddr = (typeof walletAddress === 'string' && walletAddress.trim() !== '') ? walletAddress.trim().substring(0, 64) : null;

    // Lightweight rate limiter: 5 comments per minute per username
    const now = Date.now();
    const windowMs = 60 * 1000;
    const limit = 5;
    
    const userLimits = commentsRateLimits.get(username) || [];
    const validLimits = userLimits.filter(t => now - t < windowMs);
    if (validLimits.length >= limit) {
      return res.status(429).json({ error: "Too many comments. Please wait a moment." });
    }
    validLimits.push(now);
    commentsRateLimits.set(username, validLimits);

    const query = `
      INSERT INTO market_comments (prism_market_id, username, wallet_address, message)
      VALUES ($1, $2, $3, $4)
      RETURNING id, prism_market_id, polymarket_id, username, wallet_address, message, created_at;
    `;
    const result = await tigerdb.query(query, [marketId, username, wAddr, message]);
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error("[tigerdb] insert comment error:", err.message);
    res.status(500).json({ error: "Failed to post comment" });
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
  await tigerdb.end().catch(() => {});
  console.log("[INFO] PostgreSQL pool closed");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err) => {
  console.error("[FATAL] Main process crashed:", err);
  process.exit(1);
});
