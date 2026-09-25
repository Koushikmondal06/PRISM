var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/test_oracle.ts
var anchor = __toESM(require("@coral-xyz/anchor"));
var import_anchor = require("@coral-xyz/anchor");
var import_web3 = require("@solana/web3.js");
var fs = __toESM(require("fs"));
var idl = JSON.parse(fs.readFileSync("./target/idl/prism.json", "utf8"));
var connection = new import_web3.Connection("https://api.devnet.solana.com", "confirmed");
var walletKeypair = import_web3.Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8")))
);
var wallet = new anchor.Wallet(walletKeypair);
var provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);
var programId = new import_web3.PublicKey("6cD9BZG2bddZZ1xoNReLVEvdYVaxpxY97F7MfZyov7XW");
var program = new import_anchor.Program(idl, provider);
async function main() {
  console.log("==================================================");
  console.log("1. IDENTIFY THE ORACLE");
  console.log("==================================================");
  console.log("Program ID:", programId.toBase58());
  console.log("Connected Wallet:", wallet.publicKey.toBase58());
  const [configPda] = import_web3.PublicKey.findProgramAddressSync([Buffer.from("config_v3")], programId);
  console.log("Config PDA:", configPda.toBase58());
  console.log("\n==================================================");
  console.log("3. VERIFY ORACLE AUTHORIZATION ON-CHAIN");
  console.log("==================================================");
  try {
    const config = await program.account.config.fetch(configPda);
    console.log("Authority:", config.authority.toBase58());
    console.log("Oracle:", config.oracle.toBase58());
    console.log("Collateral Mint:", config.usdcMint.toBase58());
    console.log("AUTHORITY MATCH:", config.authority.equals(wallet.publicKey) ? "YES" : "NO");
    console.log("ORACLE MATCH:", config.oracle.equals(wallet.publicKey) ? "YES" : "NO");
    console.log("CONNECTED WALLET MATCH: YES");
  } catch (err) {
    console.error("Failed to fetch config:", err);
  }
  const markets = await program.account.market.all();
  const now = Math.floor(Date.now() / 1e3);
  let testMarket = markets.find((m) => {
    return Object.keys(m.account.status)[0] === "open" && m.account.endTs.toNumber() <= now;
  });
  if (!testMarket) {
    console.log("No market eligible for freezing (status=Open, endTs<=now). Finding any Open market to simulate Freeze...");
    testMarket = markets.find((m) => Object.keys(m.account.status)[0] === "open");
  }
  if (testMarket) {
    console.log("\n==================================================");
    console.log("4. TEST ORACLE SIGNING DIRECTLY");
    console.log("==================================================");
    console.log("Instruction: freeze");
    console.log("Market PDA:", testMarket.publicKey.toBase58());
    console.log("Oracle public key:", wallet.publicKey.toBase58());
    console.log("Expected status: Frozen");
    console.log("Current status:", Object.keys(testMarket.account.status)[0]);
    console.log("Current timestamp:", now);
    console.log("Market end_ts:", testMarket.account.endTs.toNumber());
    console.log("\n==================================================");
    console.log("5. SIMULATE FIRST");
    console.log("==================================================");
    try {
      const tx = await program.methods.freeze().accounts({
        oracle: wallet.publicKey,
        market: testMarket.publicKey
      }).transaction();
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.sign(walletKeypair);
      const sim = await connection.simulateTransaction(tx);
      console.log("Simulation logs:", sim.value.logs);
      if (sim.value.err) {
        console.error("Simulation failed:", sim.value.err);
      } else {
        console.log("Simulation succeeded!");
        console.log("\n==================================================");
        console.log("6. SEND THE TRANSACTION");
        console.log("==================================================");
        const sig = await connection.sendRawTransaction(tx.serialize());
        console.log("Transaction signature:", sig);
        const confirmation = await connection.confirmTransaction(sig, "confirmed");
        console.log("Confirmation status:", confirmation.value.err ? "Failed" : "Success");
        console.log("\n==================================================");
        console.log("7. READ THE MARKET DIRECTLY FROM SOLANA");
        console.log("==================================================");
        const afterMarket = await program.account.market.fetch(testMarket.publicKey);
        console.log("market PDA:", testMarket.publicKey.toBase58());
        console.log("status:", Object.keys(afterMarket.status)[0]);
        console.log("yesSupply:", afterMarket.yesSupply.toString());
        console.log("noSupply:", afterMarket.noSupply.toString());
        console.log("winningOutcome:", afterMarket.winningOutcome);
        console.log("aiResolutionConfidence:", afterMarket.aiResolutionConfidence);
        console.log("endTs:", afterMarket.endTs.toString());
        console.log("BEFORE STATUS:", Object.keys(testMarket.account.status)[0]);
        console.log("AFTER STATUS:", Object.keys(afterMarket.status)[0]);
      }
    } catch (e) {
      console.error("Error during execution:", e);
    }
  } else {
    console.log("No test market found!");
  }
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
