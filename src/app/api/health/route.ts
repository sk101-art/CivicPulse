import { prisma } from "@/lib/prisma";
import { isOllamaAvailable } from "@/lib/ollama";
import { NextResponse } from "next/server";

export async function GET() {
  const results = {
    database: "Unknown",
    ollama: "Unknown",
    timestamp: new Date().toISOString()
  };

  try {
    // Check Database connection
    await prisma.$queryRaw`SELECT 1`;
    results.database = "Healthy";
  } catch (error) {
    console.error("Database health check failed:", error);
    results.database = "Unhealthy/Connection Error";
  }

  try {
    // Check Ollama
    const available = await isOllamaAvailable();
    results.ollama = available ? "Healthy" : "Offline";
  } catch {
    results.ollama = "Unreachable";
  }

  return NextResponse.json(results);
}
