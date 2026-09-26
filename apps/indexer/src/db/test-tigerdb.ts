import { tigerdb } from "./tigerdb.js";

async function main() {
  try {
    const res = await tigerdb.query("SELECT NOW() AS now");
    console.log("Tiger Cloud connected successfully! Timestamp:", res.rows[0].now);
    
    console.log("Verifying tables...");
    const tables = await tigerdb.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'market_comments');
    `);
    
    console.log("Tables found:");
    tables.rows.forEach((row: any) => console.log(`- ${row.table_name}`));
    
  } catch (error) {
    console.error("Connection failed:", (error as Error).message);
  } finally {
    await tigerdb.end();
  }
}

main();
