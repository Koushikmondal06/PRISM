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
  const market = await program.account.market.fetch(marketKey);
  
  console.log("=== MARKET PDA ===");
  console.log("authority:", market.authority.toBase58());
  console.log("oracle:", market.oracle.toBase58());
  console.log("usdcMint:", market.usdcMint.toBase58());
  console.log("polymarketId:", market.polymarketId);
  console.log("question:", market.question);
  console.log("endTs:", market.endTs.toString());
  console.log("status:", market.status);
  console.log("winningOutcome:", market.winningOutcome);
  console.log("yesSupply:", market.yesSupply.toString());
  console.log("noSupply:", market.noSupply.toString());
  console.log("freezeTimestamp:", market.freezeTimestamp.toString());
  console.log("aiResolutionConfidence:", market.aiResolutionConfidence.toString());

  const user = new PublicKey("C3h4EafbBtvdjxNPCmuFAfXmwpSTHsofbv8Dj4sG98pb");
  const [positionKey] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketKey.toBuffer(), user.toBuffer()],
    program.programId
  );
  
  try {
    const position = await program.account.position.fetch(positionKey);
    console.log("\n=== POSITION PDA ===");
    console.log("user:", position.owner.toBase58());
    console.log("market:", position.market.toBase58());
    console.log("yesShares:", position.yesShares.toString());
    console.log("noShares:", position.noShares.toString());
  } catch(e: any) {
    console.log("\n=== POSITION PDA ===");
    console.log("Not found or error:", e.message);
  }
}
main().catch(console.error);
