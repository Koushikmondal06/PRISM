import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import idl from "../apps/indexer/src/idl/prism.json" assert { type: "json" };
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const keypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("/home/debian-koushik/.config/solana/id.json", "utf-8")))
  );
  // Using the oracle's keypair just to sign, wait, the user's wallet must sign redeem.
  // We don't have the user's private key (C3h4E...), so we can't fully execute redeem on devnet.
  // But we can simulate or just state we don't have the key.
}
main().catch(console.error);
