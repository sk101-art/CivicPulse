import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Module } from "node:module";

// CLI-only bridge for server modules. No quota resets, fixtures or synthetic observations.
const serverOnlyPath = require.resolve("server-only");
const serverOnly = new Module(serverOnlyPath);
serverOnly.exports = {};
serverOnly.loaded = true;
require.cache[serverOnlyPath] = serverOnly;
for (const file of [".env", ".env.local"]) {
  const full = path.resolve(file);
  if (fs.existsSync(full)) dotenv.config({ path: full, override: true, quiet: true });
}
async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  try {
    const { runTrafficSample } = await import("../src/lib/jobs/trafficSample");
    const run = await prisma.scheduledJobRun.create({ data: { job: "traffic-sample", status: "RUNNING", summary: "Manual provider refresh using normal quota limits" } });
    const start = Date.now();
    try {
      const result = await runTrafficSample(start);
      await prisma.scheduledJobRun.update({ where: { id: run.id }, data: { status: result.failed ? "DEGRADED" : result.skipped ? "SKIPPED" : "SUCCEEDED", processed: result.processed, failed: result.failed ?? 0, skipped: result.skipped ?? null, finishedAt: new Date(), durationMs: Date.now() - start } });
      console.log(JSON.stringify({ source: "TomTom", ...result, durationMs: Date.now() - start }));
      if (result.failed || result.skipped) process.exitCode = 1;
    } catch {
      await prisma.scheduledJobRun.update({ where: { id: run.id }, data: { status: "FAILED", failed: 1, finishedAt: new Date() } });
      throw new Error("Refresh failed");
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("Traffic refresh failed. Check provider and database configuration; no credentials were printed."); process.exitCode = 1; });
