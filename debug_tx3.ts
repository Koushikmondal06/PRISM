import * as web3 from "@solana/web3.js";

async function run() {
  const connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");
  const pubkey = new web3.PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW"); // program
  
  const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 150 }, "confirmed");
  
  for (const s of signatures) {
    const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.meta) continue;
    
    // Check all deltas
    const preMap = new Map();
    (tx.meta.preTokenBalances || []).forEach(b => {
      if (b.mint === "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU") {
        preMap.set(b.accountIndex, b);
      }
    });
    
    const postMap = new Map();
    (tx.meta.postTokenBalances || []).forEach(b => {
      if (b.mint === "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU") {
        postMap.set(b.accountIndex, b);
      }
    });
    
    const allIndices = new Set([...preMap.keys(), ...postMap.keys()]);
    for (const idx of allIndices) {
      const pre = preMap.get(idx);
      const post = postMap.get(idx);
      const preAmt = pre ? Number(pre.uiTokenAmount.uiAmountString) : 0;
      const postAmt = post ? Number(post.uiTokenAmount.uiAmountString) : 0;
      const delta = postAmt - preAmt;
      
      if (Math.abs(delta + 15.42) < 0.01) {
        console.log(`BINGO! Found EXACT -15.42 delta in tx ${s.signature} for account index ${idx}`);
        console.log("PRE:", pre);
        console.log("POST:", post);
      }
    }
  }
}
run();
