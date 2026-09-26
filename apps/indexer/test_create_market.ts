import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { loadConfig, createMarketOnChain } from "./src/solana.js";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { fetchMarketBySlug, normalizeMarket } from "@prism/shared";

async function main() {
  const cfg = await loadConfig();
  
  // Choose a real Gamma market to test with
  const slug = "will-glenn-youngkin-win-the-2028-us-presidential-election";
  console.log("Fetching", slug, "from Gamma...");
  const gammaMarket = await fetchMarketBySlug(slug);
  if (!gammaMarket) {
    console.error("Could not fetch gamma market");
    return;
  }
  
  const curated = normalizeMarket(gammaMarket);
  if (!curated) {
    console.error("Could not normalize market");
    return;
  }
  
  const polymarketId = curated.polymarketId;
  const question = curated.question;
  const endTs = new BN(curated.endTs);
  const priceYesBps = curated.priceYesBps;
  
  try {
    const marketKey = await createMarketOnChain(cfg, curated);
    console.log("Success! Market PDA:", marketKey);
  } catch (err: any) {
    console.error("Failed to create:", err);
  }
}

main().catch(console.error);
