import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";

function loadKeypair(filePath: string): Keypair {
  const resolved = filePath.replace(/^~/, process.env.HOME || "");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf8")) as number[])
  );
}

async function main() {
  const recipientAddr = process.argv[2] || "Ea3TNJEQs4HDaY5xdsJHnQWG4XdfsWMBqNYTeASW1mj7";
  const recipient = new PublicKey(recipientAddr);
  const usdcMint = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");

  const rpc = "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const payer = loadKeypair(
    process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME || "", ".config/solana/id.json")
  );

  console.log(`Requesting Devnet USDC (Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr) for ${recipient.toBase58()}...`);

  const ata = getAssociatedTokenAddressSync(usdcMint, recipient);

  const tx = new Transaction();

  const ataInfo = await connection.getAccountInfo(ata);
  if (!ataInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        recipient,
        usdcMint
      )
    );
  }

  // SPL Token Faucet Program ID: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU (Devnet USDC Faucet)
  const faucetProgramId = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const [faucetPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("faucet"), usdcMint.toBuffer()],
    faucetProgramId
  );

  // Faucet instruction data: 1 (airdrop) + 100_000_000 (100 USDC in u64 LE)
  const data = Buffer.from([1, ...new BN(100_000_000).toArray("le", 8)]);

  const faucetIx = new TransactionInstruction({
    programId: faucetProgramId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: true },
      { pubkey: faucetPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  tx.add(faucetIx);

  const sig = await connection.sendTransaction(tx, [payer]);
  await connection.confirmTransaction(sig, "confirmed");

  console.log(`✓ Funded 100 Devnet USDC to ${recipient.toBase58()}! Tx: ${sig}`);
}

import { BN } from "@coral-xyz/anchor";
main().catch((err) => {
  console.error("Faucet Error:", err);
  process.exit(1);
});
