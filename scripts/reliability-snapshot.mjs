// Read-only aggregate evidence. Never emits connection strings, names or coordinates.
import fs from "node:fs";
import dotenv from "dotenv";
import pg from "pg";
// Prisma timestamps are stored as UTC without a timezone. Do not interpret them
// using this operator machine's local timezone when producing evidence.
pg.types.setTypeParser(1114, (value) => new Date(`${value.replace(" ", "T")}Z`));
const local = fs.existsSync(".env.local") ? dotenv.parse(fs.readFileSync(".env.local")) : {};
const connectionString = process.env.APP_DATABASE_URL || local.APP_DATABASE_URL;
if (!connectionString) throw new Error("APP_DATABASE_URL is required");
const pool = new pg.Pool({ connectionString, options: "-c search_path=public", max: 1, connectionTimeoutMillis: 15000 });
try {
  const { rows } = await pool.query(`SELECT
    (SELECT MAX("fetchedAt") FROM "WeatherForecast") AS "weatherFetchedAt",
    (SELECT MAX("sampledAt") FROM "TrafficSample" WHERE "isSeed" = false) AS "trafficObservedAt",
    (SELECT COUNT(*)::int FROM "Issue" WHERE "isSeed" = false) AS "nonSeedIssues",
    (SELECT COUNT(*)::int FROM "Issue" WHERE "isSeed" = true) AS "seedIssues",
    (SELECT COUNT(*)::int FROM "Issue" WHERE "isSeed" = false AND "status" = 'VERIFIED_FIXED') AS "nonSeedVerifiedFixed"`);
  const jobs = await pool.query(`SELECT DISTINCT ON ("job") "job", "status", "startedAt", "finishedAt", "processed", "failed", "partial", "skipped" FROM "ScheduledJobRun" ORDER BY "job", "startedAt" DESC`);
  const report = { checkedAt: new Date().toISOString(), scope: "Configured public database; independently confirm deployment target", ...rows[0], jobs: jobs.rows, interpretation: "Non-seed does not prove real-world activity. No impact claims without provenance and field validation." };
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error("Reliability snapshot failed. Check database availability and migration status; no credentials were printed.");
  process.exitCode = 1;
} finally { await pool.end(); }
