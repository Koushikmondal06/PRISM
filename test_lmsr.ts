import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createMint, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";

// Initialize Provider
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

// Read IDL
const idl = JSON.parse(fs.readFileSync("./apps/web/src/idl/prism.json", "utf8"));
const programId = new PublicKey(idl.address);
const program = new Program(idl, provider);

function configPda() {
    return PublicKey.findProgramAddressSync([Buffer.from("config_v3")], programId);
}

function marketPda(polymarketId: string) {
    return PublicKey.findProgramAddressSync([Buffer.from("market"), Buffer.from(polymarketId)], programId);
}

function vaultPda(market: PublicKey) {
    return PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], programId);
}

function positionPda(market: PublicKey, owner: PublicKey) {
    return PublicKey.findProgramAddressSync([Buffer.from("position"), market.toBuffer(), owner.toBuffer()], programId);
}

// LMSR math functions
function calculateLmsrPrices(b: number, yesSupply: number, noSupply: number) {
  const maxQ = Math.max(yesSupply / b, noSupply / b);
  const eYes = Math.exp((yesSupply / b) - maxQ);
  const eNo = Math.exp((noSupply / b) - maxQ);
  const pYes = eYes / (eYes + eNo);
  const pNo = eNo / (eYes + eNo);
  return { yesPrice: pYes, noPrice: pNo };
}

function calculateLmsrCost(
  b: number,
  currentYes: number,
  currentNo: number,
  shareAmount: number,
  outcome: 0 | 1
) {
  const oldYes = currentYes + 1;
  const oldNo = currentNo + 1;
  let newYes = oldYes;
  let newNo = oldNo;

  if (outcome === 0) newYes += shareAmount;
  else newNo += shareAmount;

  const maxQ = Math.max(newYes / b, newNo / b);
  const newCost = b * (maxQ + Math.log(Math.exp(newYes / b - maxQ) + Math.exp(newNo / b - maxQ)));
  const maxQOld = Math.max(oldYes / b, oldNo / b);
  const oldCost = b * (maxQOld + Math.log(Math.exp(oldYes / b - maxQOld) + Math.exp(oldNo / b - maxQOld)));
  const cost = newCost - oldCost;
  return Math.max(0, Math.round(cost));
}

async function main() {
    const authority = provider.wallet.publicKey;
    const [confPda] = configPda();
    const confData = await (program.account as any).config.fetch(confPda);
    const usdcMint = confData.usdcMint;
    
    console.log("Config PDA:", confPda.toBase58());
    console.log("USDC Mint:", usdcMint.toBase58());

    const polyId = "test_lmsr_" + Math.floor(Math.random() * 1000000).toString();
    const [mPda] = marketPda(polyId);
    const [vPda] = vaultPda(mPda);
    
    console.log("\n--- Creating Market ---");
    console.log("Market PDA:", mPda.toBase58());
    console.log("Vault PDA:", vPda.toBase58());
    
    const endTs = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    await program.methods
        .createMarket(polyId, "LMSR Test?", new anchor.BN(endTs), 5000)
        .accounts({
            authority,
            config: confPda,
            usdcMint,
            market: mPda,
            vault: vPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    let marketAcc = await (program.account as any).market.fetch(mPda);
    console.log("\n--- Initial Market State ---");
    console.log("yesSupply raw:", marketAcc.yesSupply.toString(), "human:", marketAcc.yesSupply.toNumber() / 1e6);
    console.log("noSupply raw:", marketAcc.noSupply.toString(), "human:", marketAcc.noSupply.toNumber() / 1e6);
    console.log("lmsrB raw:", marketAcc.lmsrB.toString(), "human:", marketAcc.lmsrB.toNumber() / 1e6);
    console.log("status:", JSON.stringify(marketAcc.status));
    
    let prices = calculateLmsrPrices(marketAcc.lmsrB.toNumber(), marketAcc.yesSupply.toNumber(), marketAcc.noSupply.toNumber());
    console.log("calculated YES probability:", prices.yesPrice);
    console.log("calculated NO probability:", prices.noPrice);
    
    const buySharesHuman = 4;
    const buySharesRaw = buySharesHuman * 1_000_000;
    
    const frontendCostRaw = calculateLmsrCost(marketAcc.lmsrB.toNumber(), marketAcc.yesSupply.toNumber(), marketAcc.noSupply.toNumber(), buySharesRaw, 0);
    console.log("frontend predicted cost (raw):", frontendCostRaw);
    console.log("frontend predicted cost (human USDC):", frontendCostRaw / 1e6);
    
    // Simulate Buy 1 YES
    const userUsdc = getAssociatedTokenAddressSync(usdcMint, authority);
    const [posKey] = positionPda(mPda, authority);
    
    const preUsdcBal = await provider.connection.getTokenAccountBalance(userUsdc);
    console.log("Pre USDC balance:", preUsdcBal.value.uiAmount);

    console.log("\n--- Buying 1 YES ---");
    await program.methods
        .buy(0, new anchor.BN(buySharesRaw))
        .accounts({
            user: authority,
            market: mPda,
            position: posKey,
            vault: vPda,
            userUsdc,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    const postUsdcBal = await provider.connection.getTokenAccountBalance(userUsdc);
    console.log("Post USDC balance:", postUsdcBal.value.uiAmount);
    
    const actualCostHuman = (preUsdcBal.value.uiAmount || 0) - (postUsdcBal.value.uiAmount || 0);
    const actualCostRaw = Math.round(actualCostHuman * 1e6);
    console.log("actual USDC charged (raw):", actualCostRaw);
    console.log("actual USDC charged (human):", actualCostHuman);
    
    console.log("exact difference (raw):", actualCostRaw - frontendCostRaw);

    marketAcc = await (program.account as any).market.fetch(mPda);
    console.log("\n--- After Buy Market State ---");
    console.log("yesSupply raw:", marketAcc.yesSupply.toString(), "human:", marketAcc.yesSupply.toNumber() / 1e6);
    console.log("noSupply raw:", marketAcc.noSupply.toString(), "human:", marketAcc.noSupply.toNumber() / 1e6);
    
    prices = calculateLmsrPrices(marketAcc.lmsrB.toNumber(), marketAcc.yesSupply.toNumber(), marketAcc.noSupply.toNumber());
    console.log("calculated YES probability:", prices.yesPrice);
    console.log("calculated NO probability:", prices.noPrice);
}

main().catch(console.error);
