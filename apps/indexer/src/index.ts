import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import fs from "node:fs";
import {
  collectBinaryMarkets,
  marketsFromFixtures,
  type StoredMarket,
  type GammaMarket,
  calculateLmsrPrices,
} from "@prism/shared";
import { loadConfig, createMarketOnChain, ensureInitialized } from "./solana.js";
import {
  marketExists,
  storeMarket,
  getAllMarkets,
  getMarketById,
  updateMarketStatus,
  getMarketCount,
} from "./db.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_DIR = path.resolve(process.env.PRISM_DATA_DIR || path.join(REPO_ROOT, "data"));
const STORE_PATH = path.join(DATA_DIR, "markets.json");
const WEB_MIRROR = path.resolve(
  process.env.WEB_MARKETS_PATH || path.join(REPO_ROOT, "apps/web/public/markets.json")
);
const FIXTURES = path.resolve(
  process.env.GAMMA_FIXTURES || path.join(REPO_ROOT, "data/fixtures/gamma-markets.json")
);
const POLL_MS = Number(process.env.INDEXER_POLL_MS || 60_000);
const MAX_CREATE = Number(process.env.INDEXER_MAX_CREATE_PER_TICK || 5);
const LIMIT_EVENTS = Number(process.env.INDEXER_EVENT_LIMIT || 20);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const USE_FIXTURES =
  process.env.USE_FIXTURES === "1" ||
  process.env.USE_FIXTURES === "true" ||
  process.argv.includes("--fixtures");

async function loadMarkets() {
  if (USE_FIXTURES) {
    console.log(`[indexer] using fixtures: ${FIXTURES}`);
    const raw = JSON.parse(fs.readFileSync(FIXTURES, "utf8")) as GammaMarket[];
    return marketsFromFixtures(raw);
  }
  try {
    return await collectBinaryMarkets(LIMIT_EVENTS);
  } catch (err) {
    console.warn("[indexer] Gamma unreachable, falling back to fixtures:", err);
    const raw = JSON.parse(fs.readFileSync(FIXTURES, "utf8")) as GammaMarket[];
    return marketsFromFixtures(raw);
  }
}

function loadStore(): Record<string, StoredMarket> {
  if (!fs.existsSync(STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as Record<string, StoredMarket>;
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

async function tick() {
  console.log(`[indexer] polling Gamma (limit=${LIMIT_EVENTS})…`);
  
  // Check which markets already exist in database to reduce Gamma calls
  const markets = await loadMarkets();
  console.log(`[indexer] found ${markets.length} binary markets from Gamma`);

  const store = loadStore();
  let created = 0;

  const cfg = DRY_RUN ? null : await loadConfig();
  if (cfg && !DRY_RUN) {
    await ensureInitialized(cfg);
  }

  for (const m of markets) {
    // Skip if market already exists in database (reduces Gamma API dependency)
    if (await marketExists(m.polymarketId)) {
      console.log(`[indexer] skipping ${m.polymarketId} - already in DB`);
      continue;
    }
    
    if (store[m.polymarketId]) continue;
    if (created >= MAX_CREATE) break;

    // Skip markets already past end
    if (m.endTs <= Math.floor(Date.now() / 1000)) continue;

    // Phase 4: AI curation filter — skip markets with low AI score
    const aiScore = m.aiScore ?? 50; // default neutral if no AI data
    const aiReason = m.aiReason ?? "Auto-accepted (no AI data)";
    if (aiScore < Number(process.env.AI_SCORE_THRESHOLD || 30)) {
      console.log(`[indexer] AI filter: skipping ${m.polymarketId} (score=${aiScore}, reason=${aiReason})`);
      continue;
    }

    let pubkey: string | undefined;
    if (!DRY_RUN && cfg) {
      try {
        pubkey = await createMarketOnChain(cfg, m);
        console.log(`[indexer] created on-chain ${m.polymarketId} → ${pubkey}`);
        
        // Store in database to reduce future Gamma calls
        const storedMarket: StoredMarket = {
          polymarketId: m.polymarketId,
          question: m.question,
          endTs: m.endTs,
          priceYesBps: m.priceYesBps,
          lmsr_b: m.lmsr_b,
          closed: false,
          winningOutcome: null,
          aiScore: m.aiScore,
          aiReason: m.aiReason,
          aiTitle: m.aiTitle,
          aiTags: m.aiTags,
          aiSummary: m.aiSummary,
          raw: m as any,
          pubkey,
          status: "open",
          createdAt: new Date().toISOString(),
        };
        await storeMarket(storedMarket);
        console.log(`[indexer] stored ${m.polymarketId} in database`);
      } catch (err) {
        console.error(`[indexer] create failed for ${m.polymarketId}:`, err);
        continue;
      }
    } else {
      console.log(`[indexer] DRY_RUN would create: ${m.question.slice(0, 80)}`);
    }

    store[m.polymarketId] = {
      ...m,
      pubkey,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    created += 1;
  }

  // Sync database with web store
  const dbMarkets = await getAllMarkets();
  for (const dbMarket of dbMarkets) {
    const key = dbMarket.source === "prism" && dbMarket.pubkey ? dbMarket.pubkey : dbMarket.polymarketId;
    if (!store[key]) {
      store[key] = {
        ...dbMarket,
        status: dbMarket.status as any,
        pubkey: dbMarket.pubkey,
        createdAt: dbMarket.createdAt,
      };
    }
  }

  // Poll native markets from Solana
  if (cfg && !DRY_RUN) {
    try {
      const onChainMarkets = await cfg.program.account.market.all();
      for (const onChain of onChainMarkets) {
        const data = onChain.account as any;
        const polyId = data.polymarketId;
        let storedMarket = store[polyId] || store[onChain.publicKey.toBase58()];
        const isNative = storedMarket ? storedMarket.source === "prism" : true;
        const key = isNative ? onChain.publicKey.toBase58() : polyId;
        
        const lmsrB = data.lmsrB ? data.lmsrB.toNumber() : 1_000_000;
        const yesSupply = data.yesSupply ? data.yesSupply.toNumber() : 0;
        const noSupply = data.noSupply ? data.noSupply.toNumber() : 0;
        
        const prices = calculateLmsrPrices(lmsrB, yesSupply, noSupply);
        const priceYesBps = Math.round(prices.yesPrice * 10000);

        if (!store[key]) {
          store[key] = {
            polymarketId: polyId,
            question: data.question,
            endTs: data.endTs.toNumber(),
            priceYesBps: priceYesBps,
            yesPrice: prices.yesPrice,
            noPrice: prices.noPrice,
            lmsr_b: lmsrB,
            closed: Object.keys(data.status || {})[0]?.toLowerCase() === "resolved",
            winningOutcome: data.winningOutcome !== null ? data.winningOutcome : null,
            aiScore: 50, // default
            aiReason: isNative ? "Native market" : "Mirrored market",
            aiTitle: data.question,
            aiTags: ["Yes", "No"],
            aiSummary: isNative ? "Native PRISM Market" : "Mirrored Polymarket",
            raw: data,
            pubkey: onChain.publicKey.toBase58(),
            status: Object.keys(data.status || {})[0]?.toLowerCase() as "open" | "frozen" | "resolved",
            createdAt: new Date().toISOString(),
            source: isNative ? "prism" : "polymarket"
          };
          
          console.log(`[PRICE] market=${onChain.publicKey.toBase58()}`);
          console.log(`YES supply=${yesSupply}`);
          console.log(`NO supply=${noSupply}`);
          console.log(`b=${lmsrB}`);
          console.log(`YES price=${(prices.yesPrice * 100).toFixed(2)}%`);
          console.log(`NO price=${(prices.noPrice * 100).toFixed(2)}%\n`);

        } else {
          // Update status of native/mirrored market
          const oldYesBps = store[key].priceYesBps || 5000;
          
          const oldStatus = store[key].status;
          const newStatus = Object.keys(data.status || {})[0]?.toLowerCase() as "open" | "frozen" | "resolved";
          
          store[key].status = newStatus;
          store[key].closed = newStatus === "resolved";
          store[key].winningOutcome = data.winningOutcome !== null ? data.winningOutcome : null;
          store[key].priceYesBps = priceYesBps;
          store[key].yesPrice = prices.yesPrice;
          store[key].noPrice = prices.noPrice;
          store[key].raw = data;
          
          if (oldStatus !== newStatus) {
            console.log(`[PRISM SYNC]`);
            console.log(`market=${onChain.publicKey.toBase58()}`);
            console.log(`source=${store[key].source}`);
            console.log(`status_before=${oldStatus}`);
            console.log(`status_onchain=${newStatus}`);
            console.log(`status_after=${newStatus}`);
            if (newStatus === "resolved") {
               console.log(`winner=${data.winningOutcome === 0 ? "YES" : "NO"}`);
               console.log(`confidence=${data.aiResolutionConfidence ?? 100}`);
            }
          }
          
          if (oldYesBps !== priceYesBps) {
            const newYesPct = (prices.yesPrice * 100).toFixed(2);
            const newNoPct = (prices.noPrice * 100).toFixed(2);
            
            console.log(`[PRISM PRICE]`);
            console.log(`market=${onChain.publicKey.toBase58()}`);
            console.log(`yesSupply=${yesSupply}`);
            console.log(`noSupply=${noSupply}`);
            console.log(`b=${lmsrB}`);
            console.log(`yesPrice=${newYesPct}%`);
            console.log(`noPrice=${newNoPct}%\n`);
          }
        }
      }
    } catch (err) {
      console.error("[indexer] failed to fetch native markets:", err);
    }
  }

  saveStore(store);
  console.log(`[indexer] tick done (new=${created}, tracked=${Object.keys(store).length})`);
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
