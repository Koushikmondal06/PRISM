import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";

async function run() {
  process.env.ANCHOR_PROVIDER_URL = "https://api.devnet.solana.com";
  process.env.ANCHOR_WALLET = "/home/debian-koushik/.config/solana/id.json";
  
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync("./target/idl/prism.json", "utf8"));
  const program = new Program(idl, provider);
  
  const [marketPubkey] = PublicKey.findProgramAddressSync([Buffer.from("market_v3"), Buffer.from("test1")], program.programId);
  try {
    const marketAcc = await program.account.market.fetch(marketPubkey);
    console.log({
      PDA: marketPubkey.toBase58(),
      yesSupply: marketAcc.yesSupply.toString(),
      noSupply: marketAcc.noSupply.toString(),
      lmsrB: marketAcc.lmsrB.toString(),
      priceYesBps: marketAcc.priceYesBps,
      priceNoBps: marketAcc.priceNoBps
    });
  } catch (e) {
    console.log("Could not fetch test1", e.message);
  }
}
run();
