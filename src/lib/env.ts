import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_DATABASE_URL: z.string().optional(),
  DIRECT_DATABASE_URL: z.string().optional(),
  DATABASE_URL_TEST: z.string().optional(),
  DIRECT_DATABASE_URL_TEST: z.string().optional(),
  NEXTAUTH_URL: z.string().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().optional(),
  SEED_DESK_PASSWORD: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_EVIDENCE_BUCKET: z.string().default("evidence"),
  TOMTOM_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL_VISION: z.string().default("qwen/qwen3.8-27b"),
  GROQ_MODEL_TEXT: z.string().default("openai/gpt-oss-120b"),
  AI_DAILY_CALL_CAP: z.coerce.number().default(400),
  AI_FEATURES: z.string().default("G1,G2,G7"),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().optional(),
  APP_REGION: z.string().default("IN"),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:you@example.com"),
  JOB_SECRET: z.string().optional(),
  APP_TIMEZONE: z.string().default("Asia/Kolkata"),
});

const strictRequiredKeys = [
  "APP_DATABASE_URL",
  "NEXTAUTH_SECRET",
  "TOMTOM_API_KEY",
] as const;

export type ServerEnv = z.infer<typeof serverSchema>;

function parseEnv(): ServerEnv {
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${errorDetails}`);
  }

  // Strict check (used in production or when STRICT_ENV=true)
  if (process.env.STRICT_ENV === "true") {
    const missing: string[] = [];
    for (const key of strictRequiredKeys) {
      const val = result.data[key as keyof ServerEnv];
      if (!val || typeof val !== "string" || val.trim().length === 0) {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables in strict mode:\n${missing.map((k) => `  - ${k}`).join("\n")}`
      );
    }
  }

  return result.data;
}

export const env = parseEnv();

/**
 * Checks whether an optional external API key or secret is configured.
 * In keys-later mode, unconfigured adapters report "disabled — key not set".
 */
export function isConfigured(key: keyof ServerEnv): boolean {
  const val = env[key];
  return typeof val === "string" && val.trim().length > 0;
}

/**
 * Checks whether a specific AI feature is enabled in AI_FEATURES.
 */
export function isAiFeatureEnabled(featureId: string): boolean {
  const features = (env.AI_FEATURES || "")
    .split(",")
    .map((f) => f.trim().toUpperCase());
  return features.includes(featureId.trim().toUpperCase());
}

/**
 * Helper to validate strict requirements programmatically (e.g. for startup checks / tests).
 */
export function validateStrictEnv(customEnv?: Record<string, string | undefined>): void {
  const source = customEnv || process.env;
  const missing: string[] = [];
  for (const key of strictRequiredKeys) {
    const val = source[key];
    if (!val || val.trim().length === 0) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}`
    );
  }
}
