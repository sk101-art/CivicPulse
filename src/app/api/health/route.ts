import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { NextResponse } from "next/server";

export async function GET() {
  const results = {
    status: "ok",
    database: "Unknown",
    storage: "Unknown",
    tomtomKeyPresent: Boolean(env.TOMTOM_API_KEY && env.TOMTOM_API_KEY.length > 0),
    geminiKeyPresent: Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 0),
    groqKeyPresent: Boolean(env.GROQ_API_KEY && env.GROQ_API_KEY.length > 0),
    timestamp: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    results.database = "Healthy";
  } catch (error: unknown) {
    console.error("Health check database query failed:", error);
    results.database = "Unhealthy/Connection Error";
    results.status = "degraded";
  }

  // Storage readiness check
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    results.storage = `Configured (${env.SUPABASE_EVIDENCE_BUCKET || "evidence"})`;
  } else {
    results.storage = `Keys-later mode (${env.SUPABASE_EVIDENCE_BUCKET || "evidence"})`;
  }

  const statusCode = results.database === "Healthy" ? 200 : 503;
  return NextResponse.json(results, { status: statusCode });
}
