import * as web3 from "@solana/web3.js";
import { BorshCoder } from "@coral-xyz/anchor";
import idl from "./apps/web/src/idl/prism.json" with { type: "json" };
const coder = new BorshCoder(idl as any);

async function run() {
  const connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");
  const signatures = await connection.getSignaturesForAddress(new web3.PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW"), { limit: 10 });
  const tx = await connection.getParsedTransaction(signatures[0].signature, { maxSupportedTransactionVersion: 0 });
  const inst = tx?.transaction.message.instructions.find(i => i.programId.toBase58() === "6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW");
  if (inst && 'data' in inst) {
      console.log("data:", inst.data);
      try {
          const decoded = coder.instruction.decode(inst.data, "base58");
          console.log("decoded:", decoded);
      } catch (e) {
          console.log("Error decoding:", e);
      }
  }
}
run();
