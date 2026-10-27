import "server-only";
import { prisma } from "@/lib/db/prisma";
import { AiJob } from "@prisma/client";

export interface EnqueueAiJobParams {
  feature: string;
  targetId: string;
}

/**
 * Enqueues an AI processing job (e.g. G1 vision triage, G2 description translation)
 * off the user's request path to be processed asynchronously.
 */
export async function enqueueAiJob({
  feature,
  targetId,
}: EnqueueAiJobParams): Promise<AiJob> {
  return await prisma.aiJob.create({
    data: {
      feature,
      targetId,
      status: "queued",
      attempts: 0,
    },
  });
}

/**
 * Fetches queued AI jobs for a specific feature for batch runner processing.
 */
export async function dequeueAiJobs(
  feature: string,
  batchSize: number = 10
): Promise<AiJob[]> {
  return await prisma.aiJob.findMany({
    where: {
      feature,
      status: "queued",
    },
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });
}
