import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "./apps/web/src/idl/prism.json" with { type: "json" };
import * as fs from "fs";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";

async function run() {
  const connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");
  const keypairBytes = JSON.parse(fs.readFileSync("/home/debian-koushik/.config/solana/id.json", "utf8"));
  const wallet = web3.Keypair.fromSecretKey(new Uint8Array(keypairBytes));
  
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {});
  const program = new anchor.Program(idl as any, provider);
  
  // 1. Create a fresh market
  const polyId = "test_lmsr_" + Date.now();
  const [marketPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(polyId)],
    program.programId
  );
  
  console.log("Creating market:", polyId);
  const endTs = new anchor.BN(Math.floor(Date.now()/1000) + 86400);
  await program.methods.createMarket(polyId, "Test?", endTs, 5000).accounts({
    admin: wallet.publicKey,
    market: marketPda,
  }).rpc();
  
  // 2. Buy 1 YES share
  console.log("Buying 1 YES...");
  const usdcMint = new web3.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const userUsdc = getAssociatedTokenAddressSync(usdcMint, wallet.publicKey);
  const [vaultPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPda.toBuffer()],
    program.programId
  );
  const [positionPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
    program.programId
  );
  
  let ataInfo = await connection.getAccountInfo(userUsdc);
  let builder = program.methods.buy(0, new anchor.BN(1_000_000)).accounts({
    user: wallet.publicKey,
    market: marketPda,
    position: positionPda,
    vault: vaultPda,
    userUsdc: userUsdc,
    tokenProgram: new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  });
  if(!ataInfo) {
      builder = builder.preInstructions([
          createAssociatedTokenAccountInstruction(wallet.publicKey, userUsdc, wallet.publicKey, usdcMint)
      ]);
  }
  
  const txSig = await builder.rpc();
  console.log("Buy tx:", txSig);
  
  // 3. Inspect balance
  const tx = await connection.getParsedTransaction(txSig, { maxSupportedTransactionVersion: 0 });
  const pre = tx?.meta?.preTokenBalances?.find(b => b.owner === wallet.publicKey.toBase58());
  const post = tx?.meta?.postTokenBalances?.find(b => b.owner === wallet.publicKey.toBase58());
  const preAmt = pre ? Number(pre.uiTokenAmount.uiAmountString) : 0;
  const postAmt = post ? Number(post.uiTokenAmount.uiAmountString) : 0;
  console.log("Wallet USDC Delta:", postAmt - preAmt);
}
run();
