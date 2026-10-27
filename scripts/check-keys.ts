/**
 * CivicPulse — Environment Key Checker
 * Reports which env vars are set (yes/no only, never the values).
 * Required by docs/plan/KEYS_LATER.md.
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load .env then .env.local if present
const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, ".env"))) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}
if (fs.existsSync(path.join(rootDir, ".env.local"))) {
  dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });
}

const KEYS = [
  "APP_DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "SEED_DESK_PASSWORD",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_EVIDENCE_BUCKET",
  "TOMTOM_API_KEY",
  "NEXT_PUBLIC_TOMTOM_TILES_KEY",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL_VISION",
  "GROQ_MODEL_TEXT",
  "OLLAMA_URL",
  "AI_DAILY_CALL_CAP",
  "AI_FEATURES",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_USER_AGENT",
  "APP_REGION",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "JOB_SECRET",
  "APP_TIMEZONE",
];

console.log("=== CivicPulse Environment Key Check ===");
let setCount = 0;
for (const key of KEYS) {
  const val = process.env[key];
  const isSet = typeof val === "string" && val.trim().length > 0;
  if (isSet) setCount++;
  console.log(`${key}: ${isSet ? "SET" : "NOT SET"}`);
}
console.log(`========================================`);
console.log(`Summary: ${setCount}/${KEYS.length} keys set.`);
