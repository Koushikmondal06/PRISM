import * as web3 from "@solana/web3.js";
import { BorshCoder } from "@coral-xyz/anchor";
import idl from "./apps/web/src/idl/prism.json" with { type: "json" };
const coder = new BorshCoder(idl as any);
async function run() {
  const connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");
  const tx = await connection.getParsedTransaction("5oAwyi2umQfB5ivyfJeufUq6449wwbhDv6vCemqc2yyC7oRvor6SLLJUrFGQkYGMKMaUB2CFqdvfv62aPbqVQZWe", { maxSupportedTransactionVersion: 0 });
  
  console.dir(tx?.meta?.preTokenBalances, { depth: null });
  console.dir(tx?.meta?.postTokenBalances, { depth: null });
  
  const insts = tx?.transaction.message.instructions;
  if(insts) {
    for (const inst of insts) {
      if (inst.programId.toBase58() === "6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW" && 'data' in inst) {
        try {
          const decoded = coder.instruction.decode(inst.data, "base58");
          console.log("PRISM INSTRUCTION:", decoded);
        } catch (e) {}
      }
    }
  }
}
run();
