import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Citizen-safe AI summary that was already computed for an issue (by the desk or the insights job).
 * Public pages read it with one indexed query instead of running a fresh assessment, which would call
 * TomTom and possibly an LLM and write to the issue on every page view.
 */
export async function getStoredAssessmentSummary(aiInputHash: string | null | undefined): Promise<string | null> {
  if (!aiInputHash) return null;
  const run = await prisma.aiRun.findFirst({
    where: { feature: "G-ASSESS", inputHash: aiInputHash, valid: true },
    orderBy: { createdAt: "desc" },
    select: { output: true },
  });
  const summary = (run?.output as { summary?: unknown } | null | undefined)?.summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : null;
}
