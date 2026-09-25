import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW");
const USER = new PublicKey("C3h4EafbBtvdjxNPCmuFAfXmwpSTHsofbv8Dj4sG98pb");
const USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

console.log("Expected User USDC ATA:", getAssociatedTokenAddressSync(USDC, USER).toBase58());

// Also let's check market PDA and position PDA
const marketKey = PublicKey.findProgramAddressSync([Buffer.from("market"), Buffer.from("fixture-btc-100k-v5")], PROGRAM_ID)[0];
console.log("Market PDA:", marketKey.toBase58());

const posKey = PublicKey.findProgramAddressSync([Buffer.from("position"), marketKey.toBuffer(), USER.toBuffer()], PROGRAM_ID)[0];
console.log("Position PDA:", posKey.toBase58());

// What if the frontend uses the wrong mint from onChainState?
const WRONG_USDC = new PublicKey("2SdchXVShQyK2PTdNK4MeLd7sxNHCk925DkJgq8RFsUE");
console.log("Wrong User USDC ATA (2Sdch...):", getAssociatedTokenAddressSync(WRONG_USDC, USER).toBase58());
