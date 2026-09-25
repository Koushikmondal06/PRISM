import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import fs from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { GAMMA_BASE, normalizeMarket, type StoredMarket } from "@prism/shared";
import idl from "./idl/prism.json" with { type: "json" };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_DIR = path.resolve(process.env.PRISM_DATA_DIR || path.join(REPO_ROOT, "data"));
const STORE_PATH = path.join(DATA_DIR, "markets.json");
const POLL_MS = Number(process.env.ORACLE_POLL_MS || 30_000);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function loadKeypair(filePath: string): Keypair {
  const resolved = filePath.replace(/^~/, process.env.HOME || "");
  const raw = JSON.parse(fs.readFileSync(resolved, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadStore(): Record<string, StoredMarket> {
  if (!fs.existsSync(STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as Record<string, StoredMarket>;
}

function saveStore(store: Record<string, StoredMarket>) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

async function fetchGammaMarket(id: string) {
  // Gamma supports filtering; fall back to markets list by id query when available
  const url = `${GAMMA_BASE}/markets?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

async function loadProgram() {
  const rpc = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
  const oraclePath =
    process.env.ORACLE_KEYPAIR ||
    process.env.AUTHORITY_KEYPAIR ||
    path.join(process.env.HOME || "", ".config/solana/id.json");
  const oracle = loadKeypair(oraclePath);
  const connection = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(oracle), {
    commitment: "confirmed",
  });
  const program = new Program(idl as anchor.Idl, provider);
  const programId = new PublicKey((idl as { address: string }).address);
  return { program, oracle, programId, connection };
}

function marketPda(programId: PublicKey, polymarketId: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(polymarketId)],
    programId
  );
}

async function getPrismResolution(market: StoredMarket) {
  // Currently, PRISM native markets are resolved via the Admin UI directly interacting with the Anchor program.
  // There is no automated resolution API source for native markets yet.
  // Return null to signify that the oracle background script should skip it, awaiting Admin UI action or manual input.
  return null;
}

async function tick() {
  const store = loadStore();
  const ids = Object.keys(store);
  console.log(`[oracle] checking ${ids.length} tracked markets…`);

  const now = Math.floor(Date.now() / 1000);
  const chain = DRY_RUN ? null : await loadProgram();

  for (const storeKey of ids) {
    const entry = store[storeKey];
    
    if (entry.status === "resolved") continue;

    console.log(`\n[ORACLE] Processing market`);
    console.log(`[ORACLE] Source: ${entry.source || "polymarket"}`);
    console.log(`[ORACLE] Store key: ${storeKey}`);
    console.log(`[ORACLE] Polymarket ID: ${entry.polymarketId}`);

    let marketPubkey: PublicKey;
    if (entry.source === "prism" && entry.pubkey) {
      marketPubkey = new PublicKey(entry.pubkey);
    } else {
      if (chain) {
        const [derived] = marketPda(chain.programId, entry.polymarketId);
        marketPubkey = derived;
      } else {
        marketPubkey = new PublicKey(entry.pubkey || PublicKey.default);
      }
    }
    console.log(`[ORACLE] Market PDA: ${marketPubkey.toBase58()}`);

    // Verify market status on chain
    let onChainMarket: any = null;
    if (!DRY_RUN && chain) {
      try {
        onChainMarket = await (chain.program as any).account.market.fetch(marketPubkey);
        const statusKeys = Object.keys(onChainMarket.status || {});
        console.log(`[ORACLE] On-chain status: ${statusKeys.length > 0 ? statusKeys[0] : "unknown"}`);
        console.log(`[ORACLE] End timestamp: ${onChainMarket.endTs.toNumber()}`);
        
        if (onChainMarket.oracle.toBase58() !== chain.oracle.publicKey.toBase58()) {
          console.log(`[ORACLE] Oracle mismatch (configured: ${chain.oracle.publicKey.toBase58()}, on-chain: ${onChainMarket.oracle.toBase58()}). Skipping.`);
          continue;
        }
      } catch (err) {
        console.log(`[ORACLE] Market not found on-chain. Skipping.`);
        continue;
      }
    }

    if (!onChainMarket && !DRY_RUN) continue;

    const currentStatus = onChainMarket ? Object.keys(onChainMarket.status)[0].toLowerCase() : entry.status;
    const endTs = onChainMarket ? onChainMarket.endTs.toNumber() : entry.endTs;

    if (currentStatus === "resolved") {
        entry.status = "resolved";
        entry.closed = true;
        if (onChainMarket && onChainMarket.winningOutcome !== null) {
          entry.winningOutcome = onChainMarket.winningOutcome;
        }
        continue;
    }

    // Freeze at end_ts
    if (currentStatus === "open" && now >= endTs) {
      console.log(`[oracle] freeze due: ${entry.question.slice(0, 60)}`);
      if (!DRY_RUN && chain) {
        try {
          const tx = await chain.program.methods
            .freeze()
            .accounts({ oracle: chain.oracle.publicKey, market: marketPubkey })
            .rpc();
          console.log(`[ORACLE] Freeze tx: ${tx}`);
          entry.status = "frozen";
        } catch (err) {
          console.error(`[oracle] freeze failed ${entry.polymarketId}:`, err);
          continue; // Don't proceed to resolution if freeze fails
        }
      } else {
        entry.status = "frozen";
      }
    }

    // Resolution
    let resolution: { winningOutcome: number, confidence: number } | null = null;
    
    if (entry.source === "polymarket" || !entry.source) {
      try {
        const raw = await fetchGammaMarket(entry.polymarketId);
        if (!raw) {
          console.log(`[ORACLE] Resolution source: Gamma`);
          console.log(`[ORACLE] Polymarket market has no resolution yet, skipping`);
          continue;
        }
        const normalized = normalizeMarket(raw as Parameters<typeof normalizeMarket>[0]);
        if (!normalized?.closed || normalized.winningOutcome === null) {
          console.log(`[ORACLE] Resolution source: Gamma`);
          console.log(`[ORACLE] Polymarket market has no resolution yet, skipping`);
          continue;
        }
        resolution = {
            winningOutcome: normalized.winningOutcome,
            confidence: 100 // Gamma is absolute
        };
        console.log(`[ORACLE] Resolution source: Gamma`);
      } catch (err) {
        console.error(`[oracle] gamma fetch failed ${entry.polymarketId}:`, err);
        continue;
      }
    } else if (entry.source === "prism") {
      console.log(`[ORACLE] Native market detected, skipping Gamma`);
      resolution = await getPrismResolution(entry);
      if (!resolution) {
          console.log(`[ORACLE] Native market has no resolution input, skipping`);
          continue;
      }
      console.log(`[ORACLE] Resolution source: Native API`);
    } else {
      console.log(`[ORACLE] Unknown source: ${entry.source}`);
      continue;
    }

    if (resolution) {
      console.log(`[ORACLE] Winning outcome: ${resolution.winningOutcome}`);
      console.log(`[ORACLE] AI confidence: ${resolution.confidence}`);

      if (!DRY_RUN && chain) {
        try {
          const tx = await chain.program.methods
            .resolve(resolution.winningOutcome, resolution.confidence)
            .accounts({ oracle: chain.oracle.publicKey, market: marketPubkey })
            .rpc();
          console.log(`[ORACLE] Resolve tx: ${tx}`);
          entry.status = "resolved";
          entry.winningOutcome = resolution.winningOutcome as (0 | 1);
          entry.closed = true;
        } catch (err) {
          console.error(`[oracle] resolve failed ${entry.polymarketId}:`, err);
        }
      } else {
        entry.status = "resolved";
        entry.winningOutcome = resolution.winningOutcome as (0 | 1);
        entry.closed = true;
      }
    }
  }

  saveStore(store);
}

async function main() {
  const once = process.argv.includes("--once");
  await tick();
  if (once) return;
  console.log(`[oracle] polling every ${POLL_MS}ms`);
  setInterval(() => {
    tick().catch((err) => console.error("[oracle] tick error", err));
  }, POLL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
