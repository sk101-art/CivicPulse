import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { defineConfig } from "prisma/config";

const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, ".env"))) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}
if (fs.existsSync(path.join(rootDir, ".env.local"))) {
  dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });
}

const isTestTarget = process.env.PRISMA_TARGET === "test";
let rawUrl = isTestTarget
  ? (process.env["DIRECT_DATABASE_URL_TEST"] || process.env["DATABASE_URL_TEST"] || "")
  : (process.env["DIRECT_DATABASE_URL"] || process.env["APP_DATABASE_URL"] || process.env["DATABASE_URL"] || "");

function getTargetSchema(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return u.searchParams.get("schema") || "public";
  } catch {
    return "unknown";
  }
}

// For production migrations, if no schema is specified in the URL, explicitly set schema=public
// to prevent Postgres from falling back to database role search_path (which may have test first).
if (!isTestTarget && rawUrl && !rawUrl.includes("schema=")) {
  rawUrl += (rawUrl.includes("?") ? "&" : "?") + "schema=public";
}

const targetSchema = getTargetSchema(rawUrl);
console.log(`[prisma.config] Target schema: ${targetSchema}`);

if (!isTestTarget && targetSchema === "test") {
  throw new Error(`[prisma.config] ERROR: Production database URL targets schema 'test'! Aborting.`);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: rawUrl,
  },
});
