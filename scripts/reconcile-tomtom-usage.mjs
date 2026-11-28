// Record a dated provider-dashboard baseline without deleting or resetting usage.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const month = args.month;
const products = ["routing", "flow", "incidents", "reverse-geocoding"];
if (month !== new Date().toISOString().slice(0, 7)) throw new Error("Supply the current UTC month and its provider-dashboard counts.");
const entries = products.map((product) => {
  const count = Number(args[product]);
  if (args[product] === undefined || !Number.isInteger(count) || count < 0 || count > (product === "incidents" ? 2500 : 20000)) throw new Error("Supply valid dashboard counts for every API product.");
  return { product, provider: `tomtom:baseline:${product}`, count };
});
console.log(JSON.stringify({ month, source: "User-supplied provider dashboard; not a live billing meter", entries, apply: "apply" in args }));
if ("apply" in args) {
  const file = dotenv.parse(fs.readFileSync(".env.local"));
  const pool = new pg.Pool({ connectionString: file.APP_DATABASE_URL, options: "-c search_path=public", max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const entry of entries) {
      const existing = await client.query('SELECT count FROM "ApiUsage" WHERE provider=$1 AND month=$2', [entry.provider, month]);
      if (existing.rows.length) throw new Error("Baseline already exists. No counters were changed; review a new reconciliation explicitly.");
      await client.query('INSERT INTO "ApiUsage" (id, provider, month, count, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW())', [randomUUID(), entry.provider, month, entry.count]);
    }
    await client.query("COMMIT");
    console.log("Dashboard baselines recorded. Legacy aggregate and subsequent local reservations were preserved.");
  } catch {
    await client.query("ROLLBACK");
    console.error("Reconciliation was not applied. Existing records were preserved.");
    process.exitCode = 1;
  } finally { client.release(); await pool.end(); }
}
