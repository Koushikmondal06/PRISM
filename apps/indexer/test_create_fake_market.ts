import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { loadConfig, createMarketOnChain } from "./src/solana.js";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const cfg = await loadConfig();
  
  const curated = {
    polymarketId: "123456789",
    question: "Test Polymarket market on PRISM",
    endTs: Math.floor(Date.now() / 1000) + 3600,
    priceYesBps: 5000,
    lmsr_b: 1000000,
    closed: false,
    winningOutcome: null,
    source: "polymarket",
    raw: {}
  };
  
  try {
    const marketKey = await createMarketOnChain(cfg, curated as any);
    console.log("Success! Market PDA:", marketKey);
  } catch (err: any) {
    console.error("Failed to create:", err);
  }
}

main().catch(console.error);
