import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
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

  const marketKey = new PublicKey("CaqMiz3iTzjQ8UzhCZEoTKYaBo4rDHJvypjno2WeWr2u");
  
  console.log("Attempting to freeze market...");
  try {
    const tx = await program.methods
      .freeze()
      .accounts({
        oracle: keypair.publicKey,
        market: marketKey,
      })
      .rpc();
    console.log("Frozen! Tx:", tx);
  } catch (e: any) {
    console.error("Freeze failed:", e.message);
  }

  console.log("Attempting to resolve market...");
  try {
    const tx = await program.methods
      .resolve(0, 95)
      .accounts({
        oracle: keypair.publicKey,
        market: marketKey,
      })
      .rpc();
    console.log("Resolved! Tx:", tx);
  } catch (e: any) {
    console.error("Resolve failed:", e.message);
  }
}
main().catch(console.error);
