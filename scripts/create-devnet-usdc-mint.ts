import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

function loadKeypair(filePath: string): Keypair {
  const resolved = filePath.replace(/^~/, process.env.HOME || "");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf8")) as number[])
  );
}

async function main() {
  const rpc = "https://api.devnet.solana.com";
  const authority = loadKeypair(
    process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME || "", ".config/solana/id.json")
  );

  const connection = new Connection(rpc, "confirmed");
  console.log("Authority:", authority.publicKey.toBase58());

  // Create Devnet USDC Mint (6 decimals) controlled by authority
  const usdcMint = await createMint(
    connection,
    authority,
    authority.publicKey,
    authority.publicKey,
    6,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✓ Created Devnet USDC Mint:", usdcMint.toBase58());

  // Mint 10,000 USDC to authority
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    authority.publicKey
  );
  await mintTo(connection, authority, usdcMint, ata.address, authority, 10000n * 1000000n);
  console.log(`✓ Minted 10,000 USDC to authority ATA: ${ata.address.toBase58()}`);

  const output = { usdcMint: usdcMint.toBase58(), authority: authority.publicKey.toBase58() };
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/devnet-usdc.json", JSON.stringify(output, null, 2));

  console.log("\nSet VITE_USDC_MINT=" + usdcMint.toBase58());
}

main().catch(console.error);
