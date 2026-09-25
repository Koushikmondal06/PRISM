import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";

// Using the indexer's IDL
import idl from "../apps/indexer/src/idl/prism.json" assert { type: "json" };
import { utils } from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW");

function vaultPda(market: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    PROGRAM_ID
  );
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletJson = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(walletJson));
  
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new Program(idl as anchor.Idl, provider);

  const markets = await program.account.market.all();
  if (markets.length === 0) {
    console.log("No markets to close.");
    return;
  }
  
  const market = markets[0];
  const marketPubkey = market.publicKey;
  console.log("Attempting to close market:", marketPubkey.toBase58());
  
  const [vaultPdaAddr] = vaultPda(marketPubkey);
  const usdcMint = market.account.usdcMint as PublicKey;
  
  const authorityUsdcInfo = await connection.getParsedTokenAccountsByOwner(
    authority.publicKey,
    { mint: usdcMint }
  );
  
  if (authorityUsdcInfo.value.length === 0) {
    console.log("No USDC account for admin.");
    return;
  }
  
  const authorityUsdc = authorityUsdcInfo.value[0].pubkey;

  try {
    const tx = await program.methods
      .closeMarket()
      .accounts({
        authority: authority.publicKey,
        market: marketPubkey,
        vault: vaultPdaAddr,
        authorityUsdc,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
      
    console.log("Tx Signature:", tx);
    
    // Verify PDA is gone
    const accountInfo = await connection.getAccountInfo(marketPubkey);
    console.log("Account Info after close (expect null):", accountInfo);
    
  } catch(e) {
    console.error("Failed to close:", e);
  }
}

main();
