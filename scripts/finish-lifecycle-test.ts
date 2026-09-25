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

  const marketKey = new PublicKey("7JLWV2TuDHzX4TAeQ29ZMctu7FFAU1XL58RLU4DU8ASL");

  // Wait until end_ts
  const market = await program.account.market.fetch(marketKey);
  const endTs = market.endTs.toNumber();
  console.log("Waiting for endTs:", endTs, "Current:", Math.floor(Date.now() / 1000));
  while (Math.floor(Date.now() / 1000) < endTs) {
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log("Ready to freeze!");

  console.log("=== FREEZE ===");
  try {
    const tx = await program.methods.freeze().accounts({
      oracle: keypair.publicKey,
      market: marketKey,
    }).rpc();
    console.log("Freeze Tx:", tx);
  } catch (e) {
    console.log("Freeze error:", e);
  }

  console.log("=== RESOLVE ===");
  try {
    const tx = await program.methods.resolve(0, 100).accounts({
      oracle: keypair.publicKey,
      market: marketKey,
    }).rpc();
    console.log("Resolve Tx:", tx);
  } catch (e) {
    console.log("Resolve error:", e);
  }
}
main().catch(console.error);
