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
const dbUrl = isTestTarget
  ? (process.env["DIRECT_DATABASE_URL_TEST"] || process.env["DATABASE_URL_TEST"] || "")
  : (process.env["DIRECT_DATABASE_URL"] || process.env["APP_DATABASE_URL"] || "");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations run against DIRECT_DATABASE_URL (Supabase session pooler on port 5432)
    // When PRISMA_TARGET=test, migrations deploy to DIRECT_DATABASE_URL_TEST (schema=test)
    url: dbUrl,
  },
});
