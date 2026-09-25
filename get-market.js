const anchor = require("@coral-xyz/anchor");
const { Program } = require("@coral-xyz/anchor");
const idl = require("./apps/web/src/idl/prism.json");

async function run() {
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  
  const program = new Program(idl, provider);
  
  const markets = await program.account.market.all();
  for (const m of markets) {
    if (m.account.polymarketId.includes("test")) {
      console.log(`\nMarket: ${m.account.polymarketId} (${m.publicKey.toBase58()})`);
      console.log(`yesSupply: ${m.account.yesSupply.toString()}`);
      console.log(`noSupply: ${m.account.noSupply.toString()}`);
      console.log(`lmsrB: ${m.account.lmsrB.toString()}`);
      console.log(`status: ${JSON.stringify(m.account.status)}`);
      console.log(`endTs: ${m.account.endTs.toString()}`);
    }
  }
}
run().catch(console.error);
