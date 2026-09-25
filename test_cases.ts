import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createMint, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";

function calculateLmsrPrices(b: number, yesSupply: number, noSupply: number) {
  const maxQ = Math.max(yesSupply / b, noSupply / b);
  const eYes = Math.exp((yesSupply / b) - maxQ);
  const eNo = Math.exp((noSupply / b) - maxQ);
  const pYes = eYes / (eYes + eNo);
  const pNo = eNo / (eYes + eNo);
  return { yesPrice: pYes, noPrice: pNo };
}

function lmsrCost(b: number, yes: number, no: number): number {
    const maxQ = Math.max(yes / b, no / b);
    return b * (maxQ + Math.log(Math.exp(yes / b - maxQ) + Math.exp(no / b - maxQ)));
}

function calculateLmsrCost(
  b: number, currentYes: number, currentNo: number,
  shareAmount: number, outcome: 0 | 1, side: "buy" | "sell"
): number {
  const oldYes = currentYes;
  const oldNo = currentNo;
  let newYes = oldYes;
  let newNo = oldNo;
  if (side === "buy") {
    if (outcome === 0) newYes += shareAmount; else newNo += shareAmount;
    const cost = lmsrCost(b, newYes, newNo) - lmsrCost(b, oldYes, oldNo);
    return Math.max(0, Math.round(cost));
  } else {
    if (outcome === 0) newYes -= shareAmount; else newNo -= shareAmount;
    const proceeds = lmsrCost(b, oldYes, oldNo) - lmsrCost(b, newYes, newNo);
    return Math.max(0, Math.round(proceeds));
  }
}

async function testUnitMath() {
  const b = 1_000_000;
  console.log("=== CASE A ===");
  let prices = calculateLmsrPrices(b, 0, 0);
  console.log(`YES: ${prices.yesPrice}, NO: ${prices.noPrice}`);
  let cost1 = calculateLmsrCost(b, 0, 0, 1_000_000, 0, "buy");
  console.log(`Cost to buy 1 YES: ${cost1}`);
  
  console.log("\n=== CASE B ===");
  prices = calculateLmsrPrices(b, 1_000_000, 0);
  console.log(`After buy, YES: ${prices.yesPrice}, NO: ${prices.noPrice}`);
  
  console.log("\n=== CASE C ===");
  let cost2 = calculateLmsrCost(b, 1_000_000, 0, 1_000_000, 0, "buy");
  console.log(`Cost to buy 2nd YES: ${cost2}`);
  
  console.log("\n=== CASE D ===");
  let costNo = calculateLmsrCost(b, 0, 0, 1_000_000, 1, "buy");
  prices = calculateLmsrPrices(b, 0, 1_000_000);
  console.log(`Cost NO: ${costNo}, YES: ${prices.yesPrice}, NO: ${prices.noPrice}`);
  
  console.log("\n=== CASE E ===");
  prices = calculateLmsrPrices(b, 1_000_000, 1_000_000);
  console.log(`After 1 YES and 1 NO, YES: ${prices.yesPrice}, NO: ${prices.noPrice}`);
}

async function run() {
  await testUnitMath();
}
run();
