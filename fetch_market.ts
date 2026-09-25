import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

async function run() {
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const programId = new PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW");
  
  // Need to get IDL or just fetch generic
  // It's easier to use the IDL if available. Let's just do a getProgramAccounts if needed.
  // Actually the prompt says "The screenshot market is test1" and I have test scripts.
}
run();
