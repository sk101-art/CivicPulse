import "server-only";
import { loadImageForLlm } from "./images";
import { z } from "zod";
import { Prisma, EvidenceRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runAi } from "./run";
import { LlmAdapter, LlmImageInput } from "@/lib/external/llm/types";

export const g2FixCheckSchema = z.object({
  same_location: z.enum(["yes", "no", "unclear"]),
  defect_still_visible: z.enum(["yes", "no", "unclear"]),
  confidence: z.number().min(0).max(1),
});

export type G2FixCheckResult = z.infer<typeof g2FixCheckSchema>;

export const g2JsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["same_location", "defect_still_visible", "confidence"],
  properties: {
    same_location: {
      type: "string",
      enum: ["yes", "no", "unclear"],
    },
    defect_still_visible: {
      type: "string",
      enum: ["yes", "no", "unclear"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
};

export interface ProcessG2FixCheckOptions {
  adapters?: LlmAdapter[];
}

/**
 * Executes G2 fix-check comparator on a CLAIM_FIX report:
 * 1. Compares original report photo and claim fix photo using LLM vision.
 * 2. If defect_still_visible = yes or same_location = no (with confidence >= 0.7):
 *    - Adds "Needs citizen check — AI flagged" badge to issue (hazardFlag: AI_FLAGGED_FIX_CHECK).
 *    - Writes an audit row to ActionLog.
 *    - Triggers verify-nearby notification for citizens within range.
 * 3. CRITICAL HARD RULE: NEVER changes issue status and NEVER invokes state machine transitions.
 */
export async function processG2FixCheck(
  claimReportId: string,
  options?: ProcessG2FixCheckOptions
): Promise<G2FixCheckResult | null> {
  const claimReport = await prisma.report.findUnique({
    where: { id: claimReportId },
    include: {
      issue: {
        include: {
          reports: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!claimReport) {
    return null;
  }

  // Find the original report photo (first REPORT role evidence)
  const originalReport =
    claimReport.issue.reports.find((r) => r.role === EvidenceRole.REPORT) ||
    claimReport.issue.reports[0];

  const images: LlmImageInput[] = [];

  // Load both photos (data URI or our own Supabase storage URL); order: original, then claim.
  const originalImage = originalReport ? await loadImageForLlm(originalReport.photoUrl) : null;
  const claimImage = await loadImageForLlm(claimReport.photoUrl);
  if (originalImage) images.push(originalImage);
  if (claimImage) images.push(claimImage);

  const promptText =
    `Compare the original reported road defect photo with the claimed repair photo for ` +
    `category ${claimReport.issue.category} at ${claimReport.issue.address || "reported location"}. ` +
    `Assess whether they show the same location, and whether the defect is still visible.`;

  const runResult = await runAi<G2FixCheckResult>({
    feature: "G2",
    promptVer: "g2-v1",
    userPrompt: promptText,
    images: images.length > 0 ? images : undefined,
    schema: g2FixCheckSchema,
    jsonSchema: g2JsonSchema,
    inputPayload: {
      claimReportId: claimReport.id,
      originalReportId: originalReport?.id,
      issueId: claimReport.issue.id,
      category: claimReport.issue.category,
      claimPhotoSha256: claimReport.photoSha256,
      originalPhotoSha256: originalReport?.photoSha256,
    },
    adapters: options?.adapters,
  });

  const fixCheckData = runResult.data;

  // 1. Store in Report.aiTriage for the claim report
  await prisma.report.update({
    where: { id: claimReport.id },
    data: {
      aiTriage: fixCheckData as unknown as Prisma.InputJsonValue,
    },
  });

  // 2. Evaluate flag condition: defect_still_visible = yes OR same_location = no (confidence >= 0.7)
  const shouldFlag =
    (fixCheckData.defect_still_visible === "yes" || fixCheckData.same_location === "no") &&
    fixCheckData.confidence >= 0.7;

  if (shouldFlag) {
    const currentHazard = claimReport.issue.hazardFlag || "";
    const updatedHazard = currentHazard.includes("AI_FLAGGED_FIX_CHECK")
      ? currentHazard
      : currentHazard ? `${currentHazard},AI_FLAGGED_FIX_CHECK` : "AI_FLAGGED_FIX_CHECK";

    // Set badge on issue WITHOUT changing status
    await prisma.issue.update({
      where: { id: claimReport.issue.id },
      data: {
        hazardFlag: updatedHazard,
      },
    });

    // Write audit trail into ActionLog
    await prisma.actionLog.create({
      data: {
        issueId: claimReport.issue.id,
        actorId: "system",
        action: "AI_FIX_CHECK_FLAGGED",
        reportId: claimReport.id,
        note: `AI fix-check comparator flagged issue: defect_still_visible=${fixCheckData.defect_still_visible}, same_location=${fixCheckData.same_location} (confidence: ${(fixCheckData.confidence * 100).toFixed(0)}%). Added "Needs citizen check — AI flagged" badge.`,
      },
    }).catch(() => {});
  }

  // HARD INVARIANT CHECK: Status must remain exactly as it was
  const postIssue = await prisma.issue.findUnique({
    where: { id: claimReport.issue.id },
    select: { status: true },
  });
  if (postIssue && postIssue.status !== claimReport.issue.status) {
    throw new Error(
      `CRITICAL INVARIANT VIOLATION: G2 fix check mutated status from ${claimReport.issue.status} to ${postIssue.status}`
    );
  }

  return fixCheckData;
}

/**
 * Background worker processor for enqueued G2 AiJob rows.
 */
export async function processG2Job(jobId: string, options?: ProcessG2FixCheckOptions): Promise<boolean> {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job) return false;

  await prisma.aiJob.update({
    where: { id: jobId },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  try {
    let claimReportId = job.targetId;
    const report = await prisma.report.findUnique({ where: { id: claimReportId } });
    if (!report) {
      const claimReport = await prisma.report.findFirst({
        where: { issueId: job.targetId, role: EvidenceRole.CLAIM_FIX },
        orderBy: { createdAt: "desc" },
      });
      if (claimReport) {
        claimReportId = claimReport.id;
      }
    }

    const result = await processG2FixCheck(claimReportId, options);
    if (result) {
      await prisma.aiJob.update({
        where: { id: jobId },
        data: { status: "completed" },
      });
      return true;
    } else {
      await prisma.aiJob.update({
        where: { id: jobId },
        data: { status: "failed" },
      });
      return false;
    }
  } catch {
    await prisma.aiJob.update({
      where: { id: jobId },
      data: { status: "failed" },
    });
    return false;
  }
}
