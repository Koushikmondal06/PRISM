import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Prism } from "./programs/prism/target/types/prism" || any; // Just use IDL
import idl from "./apps/web/src/idl/prism.json";

async function run() {
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  // Set dummy wallet
  const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  
  const program = new Program(idl as any, provider);
  
  const markets = await program.account.market.all();
  for (const m of markets) {
    if (m.account.polymarketId.includes("test")) {
      console.log(`\nMarket: ${m.account.polymarketId} (${m.publicKey.toBase58()})`);
      console.log(`yesSupply: ${m.account.yesSupply.toString()}`);
      console.log(`noSupply: ${m.account.noSupply.toString()}`);
      console.log(`lmsrB: ${m.account.lmsrB.toString()}`);
      console.log(`status: ${m.account.status}`);
      console.log(`endTs: ${m.account.endTs.toString()}`);
    }
  }
}
run().catch(console.error);
