import "server-only";
import { loadImageForLlm } from "./images";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runAi } from "./run";
import { formatAiEngineName } from "./engineName";
import { LlmAdapter } from "@/lib/external/llm/types";
import { recomputeIssuePriority } from "@/lib/jobs/priorityRecompute";

export const g1TriageSchema = z.object({
  category: z.enum([
    "POTHOLES",
    "DRAINAGE",
    "WATERLOGGING",
    "STREETLIGHTS",
    "SIDEWALKS",
    "FOOTPATH",
    "TRAFFIC_SIGNS",
    "ROAD_CUT",
    "TREE_FALL",
    "GRAFFITI",
    "TRASH",
    "OTHER",
    "unknown",
  ]),
  size_class: z.enum(["small", "medium", "large", "unknown"]),
  lane_position: z.enum(["wheel_path", "edge", "footpath", "unknown"]),
  water_present: z.enum(["yes", "no", "unknown"]),
  recapture_suspected: z.enum(["yes", "no", "unknown"]),
  faces_or_plates: z.enum(["yes", "no", "unknown"]),
  confidence: z.number().min(0).max(1),
});

export type G1TriageResult = z.infer<typeof g1TriageSchema>;

export const g1JsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "size_class",
    "lane_position",
    "water_present",
    "recapture_suspected",
    "faces_or_plates",
    "confidence",
  ],
  properties: {
    category: {
      type: "string",
      enum: [
        "POTHOLES",
        "DRAINAGE",
        "WATERLOGGING",
        "STREETLIGHTS",
        "SIDEWALKS",
        "FOOTPATH",
        "TRAFFIC_SIGNS",
        "ROAD_CUT",
        "TREE_FALL",
        "GRAFFITI",
        "TRASH",
        "OTHER",
        "unknown",
      ],
    },
    size_class: {
      type: "string",
      enum: ["small", "medium", "large", "unknown"],
    },
    lane_position: {
      type: "string",
      enum: ["wheel_path", "edge", "footpath", "unknown"],
    },
    water_present: {
      type: "string",
      enum: ["yes", "no", "unknown"],
    },
    recapture_suspected: {
      type: "string",
      enum: ["yes", "no", "unknown"],
    },
    faces_or_plates: {
      type: "string",
      enum: ["yes", "no", "unknown"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
};

export interface ProcessG1TriageOptions {
  adapters?: LlmAdapter[];
}

/**
 * Executes G1 photo triage on a Report:
 * 1. Sends photo evidence and reporter's chosen category to LLM provider chain.
 * 2. Stores result in Report.aiTriage.
 * 3. Flags for desk review if category disagrees (never auto-changes category).
 * 4. Sets "needs one extra verifier" if recapture_suspected = yes.
 * 5. Feeds size_class to Issue.sizeClass if empty and recomputes priority.
 */
export async function processG1Triage(
  reportId: string,
  options?: ProcessG1TriageOptions
): Promise<G1TriageResult | null> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { issue: true },
  });

  if (!report) {
    return null;
  }

  const reportedCategory = report.issue.category.toString();

  // Load the evidence photo (data URI or our own Supabase storage URL)
  const image = await loadImageForLlm(report.photoUrl);
  const images = image ? [image] : undefined;

  const runResult = await runAi<G1TriageResult>({
    feature: "G1",
    promptVer: "g1-v1",
    userPrompt: `Reporter's selected category: ${reportedCategory}. Analyze the attached road evidence photo.`,
    images,
    schema: g1TriageSchema,
    jsonSchema: g1JsonSchema,
    inputPayload: {
      reportId: report.id,
      category: reportedCategory,
      photoSha256: report.photoSha256,
    },
    adapters: options?.adapters,
  });

  const triageData = runResult.data;

  // 1. Store in Report.aiTriage
  await prisma.report.update({
    where: { id: report.id },
    data: {
      // Record which engine produced this result so the desk never has to guess.
      aiTriage: { ...triageData, _engine: formatAiEngineName(runResult.provider, runResult.model) } as unknown as Prisma.InputJsonValue,
    },
  });

  // 2. Category disagreement check (flag for desk review, NEVER auto-change category)
  const categoryDiffers =
    triageData.category !== "unknown" &&
    triageData.category.toUpperCase() !== reportedCategory.toUpperCase();

  const recaptureSuspected = triageData.recapture_suspected === "yes";

  const issueUpdates: Record<string, unknown> = {};

  if (categoryDiffers) {
    issueUpdates.needsDuplicateReview = true;
    await prisma.actionLog.create({
      data: {
        issueId: report.issue.id,
        actorId: "system",
        action: "AI_FLAGGED_CATEGORY_MISMATCH",
        reportId: report.id,
        note: `AI photo triage suggested "${triageData.category}" (differs from reported "${reportedCategory}") with confidence ${triageData.confidence.toFixed(2)} — flagged for desk review.`,
      },
    }).catch(() => {});
  }

  // 3. Recapture suspected check -> sets "needs one extra verifier"
  if (recaptureSuspected) {
    const currentHazard = report.issue.hazardFlag || "";
    if (!currentHazard.includes("NEEDS_EXTRA_VERIFIER")) {
      issueUpdates.hazardFlag = currentHazard ? `${currentHazard},NEEDS_EXTRA_VERIFIER` : "NEEDS_EXTRA_VERIFIER";
    }
    await prisma.actionLog.create({
      data: {
        issueId: report.issue.id,
        actorId: "system",
        action: "AI_RECAPTURE_FLAGGED",
        reportId: report.id,
        note: "AI detected suspected recapture/screen-photo — requirement set: needs one extra verifier.",
      },
    }).catch(() => {});
  }

  // 4. Size class feeds S only when the reporter left it empty
  let shouldRecomputePriority = false;
  if (!report.issue.sizeClass && triageData.size_class !== "unknown") {
    issueUpdates.sizeClass = triageData.size_class;
    shouldRecomputePriority = true;
  }

  if (!report.issue.lanePosition && triageData.lane_position !== "unknown") {
    issueUpdates.lanePosition = triageData.lane_position;
    shouldRecomputePriority = true;
  }

  if (Object.keys(issueUpdates).length > 0) {
    await prisma.issue.update({
      where: { id: report.issue.id },
      data: issueUpdates,
    });
  }

  if (shouldRecomputePriority) {
    await recomputeIssuePriority(report.issue.id).catch(() => {});
  }

  return triageData;
}

/**
 * Processes an enqueued G1 AiJob by targetId (Issue or Report).
 */
export interface ProcessJobOutcome {
  ok: boolean;
  error?: string;
  skipped?: string;
}

/**
 * Processes an enqueued G1 AiJob by targetId (Issue or Report).
 */
export async function processG1Job(jobId: string, options?: ProcessG1TriageOptions): Promise<ProcessJobOutcome> {
  const job = await prisma.aiJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return { ok: false, error: `Job ${jobId} not found` };

  await prisma.aiJob.update({
    where: { id: jobId },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  try {
    // targetId could be reportId or issueId
    let reportId = job.targetId;
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
      // Look for latest report on issue
      const issueReport = await prisma.report.findFirst({
        where: { issueId: job.targetId },
        orderBy: { createdAt: "desc" },
      });
      if (issueReport) {
        reportId = issueReport.id;
      } else {
        // Target report/issue no longer exists: mark failed with no retry and move on (not an error)
        await prisma.aiJob.update({
          where: { id: jobId },
          data: { status: "failed", attempts: 3 },
        });
        return { ok: true, skipped: "target_deleted" };
      }
    }

    const result = await processG1Triage(reportId, options);
    if (result) {
      await prisma.aiJob.update({
        where: { id: jobId },
        data: { status: "completed" },
      });
      return { ok: true };
    } else {
      await prisma.aiJob.update({
        where: { id: jobId },
        data: { status: "failed", attempts: 3 },
      });
      return { ok: true, skipped: "target_deleted" };
    }
  } catch (err) {
    console.error("[ai-queue] job failed", jobId, err);
    await prisma.aiJob.update({
      where: { id: jobId },
      data: { status: "failed" },
    });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
