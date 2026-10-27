import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { Pool } from "pg";

const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, ".env"))) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}
if (fs.existsSync(path.join(rootDir, ".env.local"))) {
  dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.APP_DATABASE_URL;

if (!connectionString) {
  console.error("Error: DIRECT_DATABASE_URL and APP_DATABASE_URL are not set.");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString });
  try {
    const res = await pool.query("SELECT postgis_version();");
    console.log("PostGIS version:", res.rows[0].postgis_version);
  } catch (err: any) {
    console.error("Database check failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
