import * as web3 from "@solana/web3.js";
import { fetchWalletTransactions } from "./apps/web/src/lib/transactions.ts";
import * as fs from "fs";

async function run() {
  const connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");
  const keypairBytes = JSON.parse(fs.readFileSync("/home/debian-koushik/.config/solana/id.json", "utf8"));
  const kp = web3.Keypair.fromSecretKey(new Uint8Array(keypairBytes));
  console.log("Wallet:", kp.publicKey.toBase58());
  const res = await fetchWalletTransactions(connection, kp.publicKey.toBase58(), { limit: 5 });
  console.log("Found", res.transactions.length, "transactions");
  console.dir(res.transactions, { depth: null });
}
run();
