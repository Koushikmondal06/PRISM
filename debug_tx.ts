import * as web3 from "@solana/web3.js";
import { BorshCoder } from "@coral-xyz/anchor";
import idl from "./apps/web/src/idl/prism.json" with { type: "json" };
const coder = new BorshCoder(idl as any);

async function run() {
  const connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");
  const pubkey = new web3.PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW"); // program
  
  // Find a transaction that resulted in around -15.42 USDC delta
  const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 100 }, "confirmed");
  
  for (const s of signatures) {
    const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) continue;
    
    // Calculate USDC delta for all accounts
    if (tx.meta?.preTokenBalances && tx.meta?.postTokenBalances) {
      const preMap = new Map();
      tx.meta.preTokenBalances.forEach(b => {
        if (b.mint === "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU") {
          preMap.set(b.accountIndex, b);
        }
      });
      
      const postMap = new Map();
      tx.meta.postTokenBalances.forEach(b => {
        if (b.mint === "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU") {
          postMap.set(b.accountIndex, b);
        }
      });
      
      let found1542 = false;
      const allIndices = new Set([...preMap.keys(), ...postMap.keys()]);
      for (const idx of allIndices) {
        const pre = preMap.get(idx);
        const post = postMap.get(idx);
        const preAmt = pre ? Number(pre.uiTokenAmount.uiAmountString) : 0;
        const postAmt = post ? Number(post.uiTokenAmount.uiAmountString) : 0;
        const delta = postAmt - preAmt;
        
        if (Math.abs(delta + 15.42) < 0.1 || Math.abs(delta - 15.42) < 0.1 || delta < -10) {
          found1542 = true;
          console.log(`Found large delta ${delta} in tx ${s.signature} for account index ${idx}`);
        }
      }
      
      if (found1542) {
        console.log("=== TX:", s.signature);
        console.log("PRE:", JSON.stringify(tx.meta.preTokenBalances, null, 2));
        console.log("POST:", JSON.stringify(tx.meta.postTokenBalances, null, 2));
        
        const insts = tx.transaction.message.instructions;
        for (const inst of insts) {
          if (inst.programId.toBase58() === pubkey.toBase58() && 'data' in inst) {
            try {
              const decoded = coder.instruction.decode(inst.data, "base58");
              console.log("PRISM INSTRUCTION:", decoded);
            } catch (e) {}
          }
        }
        break;
      }
    }
  }
}
run();
