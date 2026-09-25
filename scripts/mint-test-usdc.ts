import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

function loadKeypair(filePath: string): Keypair {
  const resolved = filePath.replace(/^~/, process.env.HOME || "");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf8")) as number[])
  );
}

async function main() {
  const recipientAddr = process.argv[2];
  if (!recipientAddr) {
    console.error("Usage: npx tsx scripts/mint-test-usdc.ts <WALLET_PUBKEY> [AMOUNT_USDC]");
    process.exit(1);
  }

  const amountUsdc = Number(process.argv[3] || "1000");

  const rpc = "https://api.devnet.solana.com";
  const authority = loadKeypair(
    process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME || "", ".config/solana/id.json")
  );
  const usdcMintStr = process.env.USDC_MINT;
  if (!usdcMintStr) throw new Error("USDC_MINT not set in .env");
  const usdcMint = new PublicKey(usdcMintStr);
  const recipient = new PublicKey(recipientAddr);

  const connection = new Connection(rpc, "confirmed");

  console.log(`Minting ${amountUsdc} USDC to ${recipient.toBase58()} on Devnet...`);

  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    recipient
  );

  const rawAmount = BigInt(Math.round(amountUsdc * 1_000_000));
  const tx = await mintTo(
    connection,
    authority,
    usdcMint,
    ata.address,
    authority,
    rawAmount
  );

  console.log(`✓ Minted ${amountUsdc} USDC to ${recipient.toBase58()}! Tx: ${tx}`);
}

main().catch((err) => {
  console.error("Error minting USDC:", err);
  process.exit(1);
});
