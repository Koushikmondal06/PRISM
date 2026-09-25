import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";
import path from "path";
import idl from "../apps/web/src/idl/prism.json" assert { type: "json" };

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  const keyPath = process.env.AUTHORITY_KEYPAIR?.replace(/^~/, process.env.HOME || "") || path.join(process.env.HOME || "", ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const authority = Keypair.fromSecretKey(new Uint8Array(secret));
  
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  
  const programId = new PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW");
  const program = new Program(idl as any, provider);
  
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config_v3")], programId);
  const configData = await program.account.config.fetch(configPda);
  
  const polyId = "prism:test" + Math.random().toString(36).substring(2, 8);
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(polyId)],
    programId
  );
  
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPda.toBuffer()],
    programId
  );
  
  const question = "PRISM ADMIN TEST - DELETE AFTER TEST";
  const endTs = Math.floor(Date.now() / 1000) + 15 * 60; // 15 mins
  
  console.log("Creating market:", polyId);
  console.log("Market PDA:", marketPda.toBase58());
  console.log("Vault PDA:", vaultPda.toBase58());
  console.log("Config PDA:", configPda.toBase58());
  
  const tx = await program.methods
    .createMarket(polyId, question, new anchor.BN(endTs), 5000)
    .accounts({
      authority: authority.publicKey,
      config: configPda,
      usdcMint: configData.usdcMint,
      market: marketPda,
      vault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
    
  console.log("Transaction:", tx);
  console.log("End TS:", endTs);
}

main().catch(console.error);
