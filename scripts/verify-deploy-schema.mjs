import fs from "fs";
import path from "path";

// Load .env and .env.local if present locally (on Vercel, env vars are injected directly into process.env)
const rootDir = process.cwd();

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const envLocal = parseEnvFile(path.join(rootDir, ".env.local"));
const envBase = parseEnvFile(path.join(rootDir, ".env"));

const rawUrl =
  process.env.DIRECT_DATABASE_URL ||
  process.env.APP_DATABASE_URL ||
  process.env.DATABASE_URL ||
  envLocal.DIRECT_DATABASE_URL ||
  envLocal.APP_DATABASE_URL ||
  envBase.DIRECT_DATABASE_URL ||
  envBase.APP_DATABASE_URL ||
  "";

function extractSchema(urlStr) {
  if (!urlStr) return "public";
  try {
    const u = new URL(urlStr);
    return u.searchParams.get("schema") || u.searchParams.get("search_path") || "public";
  } catch {
    const m = urlStr.match(/[?&](?:schema|search_path)=([^&]+)/);
    return m ? m[1] : "public";
  }
}

const schema = extractSchema(rawUrl);
console.log(`[build] Prisma migrate deploy target schema: ${schema}`);

if (schema === "test" || rawUrl.includes("schema=test") || rawUrl.includes("search_path=test")) {
  console.error(`[build] FATAL: Production migrate deploy target schema is '${schema}'! Aborting build.`);
  process.exit(1);
}

console.log(`[build] Schema check passed: target schema is '${schema}'.`);
