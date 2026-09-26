import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

if (!process.env.TIGERDB_URL) {
  throw new Error("TIGERDB_URL is not configured");
}

export const tigerdb = new Pool({
  connectionString: process.env.TIGERDB_URL.replace("?sslmode=require", "").trim(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: { rejectUnauthorized: false },
});
