import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
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

  console.log("Connecting to Solana Devnet RPC:", rpc);
  console.log("Authority Pubkey:", authority.publicKey.toBase58());

  const connection = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(authority), {
    commitment: "confirmed",
  });
  const program = new Program(idl as anchor.Idl, provider);

  console.log("Fetching all market accounts...");
  const markets = await program.account.market.all();
  console.log(`Found ${markets.length} market accounts.`);

  for (const m of markets) {
    const marketPubkey = m.publicKey;
    const usdcMint = m.account.usdcMint;

    console.log(`Closing market ${marketPubkey.toBase58()} (ID: ${m.account.polymarketId})...`);
    try {
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPubkey.toBuffer()],
        program.programId
      );

      // Find the authority USDC account
      const authorityUsdcInfo = await connection.getParsedTokenAccountsByOwner(
        authority.publicKey,
        { mint: usdcMint }
      );
      
      if (authorityUsdcInfo.value.length === 0) {
          console.error(`Authority has no USDC account for mint ${usdcMint.toBase58()}! Cannot close vault.`);
          continue;
      }
      const authorityUsdc = authorityUsdcInfo.value[0].pubkey;

      const tx = await program.methods
        .closeMarket()
        .accounts({
          authority: authority.publicKey,
          market: marketPubkey,
          vault: vaultPda,
          authorityUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log(`✓ Closed! Tx: ${tx}`);
    } catch (e) {
      console.error(`Failed to close market ${marketPubkey.toBase58()}:`, e);
    }
  }

  console.log("Finished deleting market accounts.");
}

main().catch((err) => {
  console.error("Error closing markets:", err);
  process.exit(1);
});
