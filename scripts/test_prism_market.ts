import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";

const idl = JSON.parse(fs.readFileSync("./target/idl/prism.json", "utf8"));
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8")))
);
const wallet = new anchor.Wallet(walletKeypair);

const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const programId = new PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW");
const program = new Program(idl as any, provider) as any;

async function main() {
  const marketsFile = JSON.parse(fs.readFileSync("./data/markets.json", "utf8"));
  const marketsArray: any[] = Object.values(marketsFile);
  const prismMarkets = marketsArray.filter((m: any) => m.source === "prism");
  if (prismMarkets.length === 0) {
    console.log("No prism market found.");
    return;
  }

  let testMarket: any = null;
  let onChainMarket: any = null;
  let marketPda: PublicKey | null = null;

  for (const vm of prismMarkets) {
    try {
      const pda = new PublicKey(vm.pubkey);
      const m = await program.account.market.fetch(pda);
      if (m.status.open) {
        testMarket = vm;
        onChainMarket = m;
        marketPda = pda;
        break;
      }
    } catch(e) {}
  }

  if (!testMarket) {
    console.log("No OPEN prism market found on-chain.");
    return;
  }

  const prismMarket = testMarket;
  
  console.log("=== STEP 1: Prism Market from JSON ===");
  console.log("Market PDA:", prismMarket.pubkey);
  console.log("Polymarket ID:", prismMarket.polymarketId);
  console.log("Question:", prismMarket.question);
  console.log("EndTs:", prismMarket.endTs);
  console.log("Status:", prismMarket.status);
  console.log("Oracle:", prismMarket.raw.oracle);
  console.log("USDC Mint:", prismMarket.raw.usdcMint);
  console.log("Winning Outcome:", prismMarket.winningOutcome);
  
  const [derivedPda] = PublicKey.findProgramAddressSync([Buffer.from("market"), Buffer.from(prismMarket.polymarketId)], programId);
  console.log("Derived PDA:", derivedPda.toBase58());
  console.log("Matches json pubkey?", derivedPda.toBase58() === prismMarket.pubkey);
  
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config_v3")], programId);
  const config = await program.account.config.fetch(configPda);
  console.log("\n=== STEP 2: Config Verification ===");
  console.log("Config PDA:", configPda.toBase58());
  console.log("Config Authority:", config.authority.toBase58());
  console.log("Config Oracle:", config.oracle.toBase58());
  console.log("Is Wallet Config Authority?", config.authority.equals(wallet.publicKey));
  console.log("Is Wallet Config Oracle?", config.oracle.equals(wallet.publicKey));

  console.log("\n=== STEP 2.5: On-chain Market Verification ===");
  console.log("On-chain Market Authority:", onChainMarket.authority.toBase58());
  console.log("On-chain Market Oracle:", onChainMarket.oracle.toBase58());
  console.log("On-chain EndTs:", onChainMarket.endTs.toNumber());
  
  const now = Math.floor(Date.now() / 1000);
  console.log("Current time:", now);
  console.log("EndTs passed?", onChainMarket.endTs.toNumber() <= now);
  console.log("On-chain status:", JSON.stringify(onChainMarket.status));

  // Freeze
  if (onChainMarket.status.open) {
    console.log("\n=== STEP 5: Freeze ===");
    try {
      const tx = await program.methods.freeze().accounts({
        oracle: wallet.publicKey,
        market: marketPda,
      }).transaction();

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(walletKeypair);

      console.log("Simulating Freeze...");
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        console.error("Simulation failed:", sim.value.err);
        console.log("Simulation logs:", sim.value.logs);
      } else {
        console.log("Simulation succeeded. Sending Freeze tx...");
        const sig = await connection.sendRawTransaction(tx.serialize());
        console.log("Freeze tx sig:", sig);
        await connection.confirmTransaction(sig, "confirmed");
        
        onChainMarket = await program.account.market.fetch(marketPda);
        console.log("On-chain status after freeze:", JSON.stringify(onChainMarket.status));
      }
    } catch(e: any) {
      console.log("Freeze failed:", e);
    }
  }

  // Resolve
  if (onChainMarket.status.frozen) {
    console.log("\n=== STEP 6: Resolve ===");
    try {
      const tx = await program.methods.resolve(0, 95).accounts({
        oracle: wallet.publicKey,
        market: marketPda as PublicKey,
      }).transaction();

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(walletKeypair);

      console.log("Simulating Resolve...");
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        console.error("Simulation failed:", sim.value.err);
        console.log("Simulation logs:", sim.value.logs);
      } else {
        console.log("Simulation succeeded. Sending Resolve tx...");
        const sig = await connection.sendRawTransaction(tx.serialize());
        console.log("Resolve tx sig:", sig);
        await connection.confirmTransaction(sig, "confirmed");
        
        onChainMarket = await program.account.market.fetch(marketPda);
        console.log("On-chain status after resolve:", JSON.stringify(onChainMarket.status));
        console.log("winningOutcome:", onChainMarket.winningOutcome);
        console.log("aiResolutionConfidence:", onChainMarket.aiResolutionConfidence);
      }
    } catch(e: any) {
      console.log("Resolve failed:", e);
    }
  }

}

main().catch(console.error);
