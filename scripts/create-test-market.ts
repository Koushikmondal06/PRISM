import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import idl from "../apps/indexer/src/idl/prism.json" assert { type: "json" };
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet.js";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("/home/debian-koushik/.config/solana/id.json", "utf-8")))
  );
  const provider = new AnchorProvider(connection, new NodeWallet(keypair), { commitment: "confirmed" });
  const program = new Program(idl as any, provider);

  const polymarketId = "lifecycle-test-001";
  const endTs = Math.floor(Date.now() / 1000) + 1800; // +30 minutes

  const [marketKey] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(polymarketId)],
    program.programId
  );
  const [configKey] = PublicKey.findProgramAddressSync([Buffer.from("config_v3")], program.programId);
  const [vaultKey] = PublicKey.findProgramAddressSync([Buffer.from("vault"), marketKey.toBuffer()], program.programId);
  const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

  console.log("=== Creating Market ===");
  console.log("Market PDA:", marketKey.toBase58());
  console.log("End TS:", endTs);

  try {
    const tx = await program.methods
      .createMarket(
        polymarketId,
        "Lifecycle Test Market 001?",
        new BN(endTs),
        5000
      )
      .accounts({
        authority: keypair.publicKey,
        config: configKey,
        usdcMint: usdcMint,
        market: marketKey,
        vault: vaultKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();
    
    console.log("Creation Tx:", tx);
  } catch (e: any) {
    console.error("Failed to create market:", e);
  }
}
main().catch(console.error);
