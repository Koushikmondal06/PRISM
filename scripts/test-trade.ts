import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
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
  
  const polyId = "prism:testhw0mdg";
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(polyId)],
    programId
  );
  
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPda.toBuffer()],
    programId
  );
  
  const [positionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketPda.toBuffer(), authority.publicKey.toBuffer()],
    programId
  );
  
  const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const userUsdc = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
  
  console.log("Trading on:", marketPda.toBase58());
  
  // Buy YES
  const txYes = await program.methods
    .buy(0, new anchor.BN(1)) // 1 YES
    .accounts({
      user: authority.publicKey,
      market: marketPda,
      position: positionPda,
      userUsdc: userUsdc,
      vault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
    
  console.log("Buy YES tx:", txYes);
  
  // Buy NO
  const txNo = await program.methods
    .buy(1, new anchor.BN(1)) // 1 NO
    .accounts({
      user: authority.publicKey,
      market: marketPda,
      position: positionPda,
      userUsdc: userUsdc,
      vault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
    
  console.log("Buy NO tx:", txNo);
}

main().catch(console.error);
