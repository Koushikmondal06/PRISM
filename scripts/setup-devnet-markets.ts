import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idl from "../apps/indexer/src/idl/prism.json" with { type: "json" };

function loadKeypair(filePath: string): Keypair {
  const resolved = filePath.replace(/^~/, process.env.HOME || "");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf8")) as number[])
  );
}

async function main() {
  const rpc = "https://api.devnet.solana.com";
  const authority = loadKeypair(
    process.env.AUTHORITY_KEYPAIR ||
      path.join(process.env.HOME || "", ".config/solana/id.json")
  );
  const oracle = authority; // Same keypair for devnet authority & oracle
  const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

  console.log("Connecting to Solana Devnet RPC:", rpc);
  console.log("Authority Pubkey:", authority.publicKey.toBase58());

  const connection = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(authority), {
    commitment: "confirmed",
  });
  const program = new Program(idl as anchor.Idl, provider);
  const programId = new PublicKey((idl as { address: string }).address);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config_v3")],
    programId
  );

  // 1. Initialize global Config on Devnet if needed
  const configInfo = await connection.getAccountInfo(configPda);
  if (!configInfo) {
    console.log("Initializing global Config account on Devnet...");
    const tx = await program.methods
      .initialize()
      .accounts({
        authority: authority.publicKey,
        oracle: oracle.publicKey,
        usdcMint,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✓ Config initialized! Tx:", tx);
  } else {
    console.log("✓ Global Config already initialized on Devnet:", configPda.toBase58());
  }

  // 2. Read markets.json fixtures and create on-chain market PDAs
  const marketsJson = JSON.parse(fs.readFileSync("apps/web/public/markets.json", "utf8"));
  
  for (const m of Object.values(marketsJson) as any[]) {
    const polymarketId = m.polymarketId;
    const question = m.question.slice(0, 200);
    const endTs = m.endTs;
    const priceYesBps = m.priceYesBps;

    const [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(polymarketId)],
      programId
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), marketPda.toBuffer()],
      programId
    );

    const marketInfo = await connection.getAccountInfo(marketPda);
    if (!marketInfo) {
      console.log(`Creating market on Devnet: "${polymarketId}" (${question})...`);
      const tx = await program.methods
        .createMarket(polymarketId, question, new BN(endTs), priceYesBps)
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          usdcMint,
          market: marketPda,
          vault: vaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      console.log(`✓ Created market ${polymarketId}! Market Pubkey: ${marketPda.toBase58()} | Tx: ${tx}`);
    } else {
      console.log(`✓ Market ${polymarketId} already exists on Devnet: ${marketPda.toBase58()}`);
    }
  }

  console.log("\n🎉 All Devnet markets initialized successfully!");
}

main().catch((err) => {
  console.error("Error setting up Devnet markets:", err);
  process.exit(1);
});
