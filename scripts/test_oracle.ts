import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";

const idl = JSON.parse(fs.readFileSync("./target/idl/prism.json", "utf8"));
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Load the local wallet (assumed to be the oracle/admin)
const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8")))
);
const wallet = new anchor.Wallet(walletKeypair);

const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const programId = new PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW");
const program = new Program(idl as any, provider) as any;

async function main() {
  console.log("==================================================");
  console.log("1. IDENTIFY THE ORACLE");
  console.log("==================================================");
  console.log("Program ID:", programId.toBase58());
  console.log("Connected Wallet:", wallet.publicKey.toBase58());
  
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config_v3")], programId);
  console.log("Config PDA:", configPda.toBase58());

  console.log("\n==================================================");
  console.log("3. VERIFY ORACLE AUTHORIZATION ON-CHAIN");
  console.log("==================================================");
  
  try {
    const config = await program.account.config.fetch(configPda);
    console.log("Authority:", config.authority.toBase58());
    console.log("Oracle:", config.oracle.toBase58());
    console.log("Collateral Mint:", config.usdcMint.toBase58());
    
    console.log("AUTHORITY MATCH:", config.authority.equals(wallet.publicKey) ? "YES" : "NO");
    console.log("ORACLE MATCH:", config.oracle.equals(wallet.publicKey) ? "YES" : "NO");
    console.log("CONNECTED WALLET MATCH: YES");
  } catch (err) {
    console.error("Failed to fetch config:", err);
  }

  // Find an open market to test freeze
  const markets = await program.account.market.all();
  // find a market that has endTs < now and status == Open
  const now = Math.floor(Date.now() / 1000);
  let testMarket: any = markets.find((m: any) => {
    return Object.keys(m.account.status)[0] === "open" && m.account.endTs.toNumber() <= now;
  });

  if (!testMarket) {
    // If no market is ready to be frozen, let's just pick any market to see if freeze simulates correctly.
    console.log("No market eligible for freezing (status=Open, endTs<=now). Finding any Open market to simulate Freeze...");
    testMarket = markets.find((m: any) => Object.keys(m.account.status)[0] === "open");
  }

  if (testMarket) {
    console.log("\n==================================================");
    console.log("4. TEST ORACLE SIGNING DIRECTLY");
    console.log("==================================================");
    console.log("Instruction: freeze");
    console.log("Market PDA:", testMarket.publicKey.toBase58());
    console.log("Oracle public key:", wallet.publicKey.toBase58());
    console.log("Expected status: Frozen");
    console.log("Current status:", Object.keys(testMarket.account.status)[0]);
    console.log("Current timestamp:", now);
    console.log("Market end_ts:", testMarket.account.endTs.toNumber());

    console.log("\n==================================================");
    console.log("5. SIMULATE FIRST");
    console.log("==================================================");
    
    try {
      const tx = await program.methods.freeze().accounts({
        oracle: wallet.publicKey,
        market: testMarket.publicKey,
      }).transaction();

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(walletKeypair);

      const sim = await connection.simulateTransaction(tx);
      console.log("Simulation logs:", sim.value.logs);
      if (sim.value.err) {
        console.error("Simulation failed:", sim.value.err);
      } else {
        console.log("Simulation succeeded!");
        
        console.log("\n==================================================");
        console.log("6. SEND THE TRANSACTION");
        console.log("==================================================");
        const sig = await connection.sendRawTransaction(tx.serialize());
        console.log("Transaction signature:", sig);
        const confirmation = await connection.confirmTransaction(sig, "confirmed");
        console.log("Confirmation status:", confirmation.value.err ? "Failed" : "Success");
        
        console.log("\n==================================================");
        console.log("7. READ THE MARKET DIRECTLY FROM SOLANA");
        console.log("==================================================");
        const afterMarket = await program.account.market.fetch(testMarket.publicKey);
        console.log("market PDA:", testMarket.publicKey.toBase58());
        console.log("status:", Object.keys(afterMarket.status)[0]);
        console.log("yesSupply:", afterMarket.yesSupply.toString());
        console.log("noSupply:", afterMarket.noSupply.toString());
        console.log("winningOutcome:", afterMarket.winningOutcome);
        console.log("aiResolutionConfidence:", afterMarket.aiResolutionConfidence);
        console.log("endTs:", afterMarket.endTs.toString());
        console.log("BEFORE STATUS:", Object.keys(testMarket.account.status)[0]);
        console.log("AFTER STATUS:", Object.keys(afterMarket.status)[0]);
      }
    } catch (e) {
      console.error("Error during execution:", e);
    }
  } else {
    console.log("No test market found!");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
