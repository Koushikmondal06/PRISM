import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import fs from "fs";
import os from "os";
import path from "path";
import idl from "../apps/indexer/src/idl/prism.json" assert { type: "json" };

const PROGRAM_ID = new PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW");
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

function marketPda(polymarketId: string) {
  return PublicKey.findProgramAddressSync([Buffer.from("market"), Buffer.from(polymarketId)], PROGRAM_ID);
}
function vaultPda(market: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], PROGRAM_ID);
}
function positionPda(market: PublicKey, user: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("position"), market.toBuffer(), user.toBuffer()], PROGRAM_ID);
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const keypairPath = path.join(os.homedir(), ".config/solana/id.json");
  const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
  const keypair = Keypair.fromSecretKey(secretKey);
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl as any, provider);

  const polymarketId = "fixture-btc-100k-v5";
  const [marketKey] = marketPda(polymarketId);
  const [vaultKey] = vaultPda(marketKey);
  const [positionKey] = positionPda(marketKey, wallet.publicKey);
  const userUsdc = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);

  const fetchMarket = async () => await program.account.market.fetch(marketKey) as any;

  console.log("=== TEST A: Buy 1 YES share ===");
  let m = await fetchMarket();
  console.log(`Pre-trade YES: ${m.yesSupply.toString()}, NO: ${m.noSupply.toString()}`);
  
  const shareAmount = new BN(1_000_000);
  let tx = await program.methods.buy(0, shareAmount).accounts({
    user: wallet.publicKey,
    market: marketKey,
    position: positionKey,
    vault: vaultKey,
    userUsdc,
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    systemProgram: new PublicKey("11111111111111111111111111111111"),
  }).rpc();
  console.log(`Success! Tx: ${tx}`);
  m = await fetchMarket();
  console.log(`Post-trade YES: ${m.yesSupply.toString()}, NO: ${m.noSupply.toString()}`);

  console.log("\n=== TEST B: Buy 1 additional YES share ===");
  tx = await program.methods.buy(0, shareAmount).accounts({
    user: wallet.publicKey,
    market: marketKey,
    position: positionKey,
    vault: vaultKey,
    userUsdc,
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    systemProgram: new PublicKey("11111111111111111111111111111111"),
  }).rpc();
  console.log(`Success! Tx: ${tx}`);
  m = await fetchMarket();
  console.log(`Post-trade YES: ${m.yesSupply.toString()}, NO: ${m.noSupply.toString()}`);

  console.log("\n=== TEST C: Try 0.1 YES share ===");
  const fracAmount = new BN(100_000); // 0.1 * 1_000_000
  tx = await program.methods.buy(0, fracAmount).accounts({
    user: wallet.publicKey,
    market: marketKey,
    position: positionKey,
    vault: vaultKey,
    userUsdc,
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    systemProgram: new PublicKey("11111111111111111111111111111111"),
  }).rpc();
  console.log(`Success! Tx: ${tx}`);
  m = await fetchMarket();
  console.log(`Post-trade YES: ${m.yesSupply.toString()}, NO: ${m.noSupply.toString()}`);

  console.log("\n=== TEST D: Buy 1 NO share ===");
  tx = await program.methods.buy(1, shareAmount).accounts({
    user: wallet.publicKey,
    market: marketKey,
    position: positionKey,
    vault: vaultKey,
    userUsdc,
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    systemProgram: new PublicKey("11111111111111111111111111111111"),
  }).rpc();
  console.log(`Success! Tx: ${tx}`);
  m = await fetchMarket();
  console.log(`Post-trade YES: ${m.yesSupply.toString()}, NO: ${m.noSupply.toString()}`);
}
main().catch(console.error);
