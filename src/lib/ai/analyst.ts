import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { runAi } from "@/lib/ai/run";
import { numbersGrounded } from "@/lib/ai/validators";
import { getRulesFallback } from "@/lib/ai/providers/rules";
import { Status } from "@prisma/client";

// Quota constants (Free tier budget protection)
export const MAX_ANALYST_DAILY_CALLS = 250;
export const MAX_ANALYST_MONTHLY_CALLS = 7500;
const ANALYST_PROVIDER = "ai_analyst";
const ANALYST_DAILY_PROVIDER = "ai_analyst_daily";

export async function tryIncrementAnalystQuota(): Promise<boolean> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentDay = new Date().toISOString().slice(0, 10);

  try {
    // Check daily cap
    const daily = await prisma.apiUsage.findUnique({
      where: {
        provider_month: {
          provider: ANALYST_DAILY_PROVIDER,
          month: currentDay,
        },
      },
      select: { count: true },
    });
    if (daily && daily.count >= MAX_ANALYST_DAILY_CALLS) {
      return false;
    }

    // Check monthly cap
    const monthly = await prisma.apiUsage.findUnique({
      where: {
        provider_month: {
          provider: ANALYST_PROVIDER,
          month: currentMonth,
        },
      },
      select: { count: true },
    });
    if (monthly && monthly.count >= MAX_ANALYST_MONTHLY_CALLS) {
      return false;
    }

    // Increment both
    await prisma.$transaction([
      prisma.apiUsage.upsert({
        where: { provider_month: { provider: ANALYST_DAILY_PROVIDER, month: currentDay } },
        create: { provider: ANALYST_DAILY_PROVIDER, month: currentDay, count: 1 },
        update: { count: { increment: 1 } },
      }),
      prisma.apiUsage.upsert({
        where: { provider_month: { provider: ANALYST_PROVIDER, month: currentMonth } },
        create: { provider: ANALYST_PROVIDER, month: currentMonth, count: 1 },
        update: { count: { increment: 1 } },
      }),
    ]);

    return true;
  } catch {
    // Fallback gracefully on DB failure
    return true;
  }
}

// 1. G-ASSESS Schemas & Method
export const AssessOutputSchema = z.object({
  summary: z.string(),
  priorityAdjustmentRecommended: z.number().min(-10).max(10),
  reasoning: z.string(),
  keyRisks: z.array(z.string()),
  suggestedAction: z.string(),
});
export type AssessOutput = z.infer<typeof AssessOutputSchema>;

export async function assessIssue(issueId: string): Promise<AssessOutput> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      category: true,
      priority: true,
      sizeClass: true,
      lanePosition: true,
      deteriorationRisk: true,
      deteriorationScore: true,
      expectedDaysToWorsen: true,
      contractorName: true,
      segment: {
        select: {
          roadClass: true,
          busesPerHour: true,
          name: true,
        },
      },
      trafficProfiles: {
        where: { dayType: "WEEKDAY", hour: 18 },
        select: { delayRatio: true },
        take: 1,
      },
      reports: {
        select: { id: true, photoUrl: true, note: true },
        take: 3,
      },
    },
  });

  if (!issue) {
    throw new Error(`Issue not found: ${issueId}`);
  }

  const delayRatio = issue.trafficProfiles?.[0]?.delayRatio ?? 0.15;
  const busesPerHour = issue.segment?.busesPerHour ?? 0;
  const detScore = issue.deteriorationScore ?? 35;
  const priority = issue.priority ?? 50;

  const inputPayload = {
    issueId: issue.id,
    category: issue.category,
    priority: Math.round(priority),
    sizeClass: issue.sizeClass ?? "MEDIUM",
    lanePosition: issue.lanePosition ?? "CURB",
    deteriorationScore: detScore,
    expectedDaysToWorsen: issue.expectedDaysToWorsen,
    busesPerHour: Math.round(busesPerHour),
    delayRatio: Math.round(delayRatio * 100) / 100,
    roadName: issue.segment?.name || "Corridor Segment",
    contractorName: issue.contractorName,
  };

  const factsForGrounding = [
    String(issue.id),
    String(issue.category),
    String(Math.round(priority)),
    String(detScore),
    String(Math.round(busesPerHour)),
    String(Math.round(delayRatio * 100)),
  ];

  const quotaOk = await tryIncrementAnalystQuota();
  if (!quotaOk) {
    return getRulesFallback("G-ASSESS", inputPayload) as AssessOutput;
  }

  const prompt = `Assess civic issue ${issue.id} (${issue.category}):
- Pavement Deterioration Score: ${detScore}/100
- Priority Index: ${Math.round(priority)}
- Road Segment: ${inputPayload.roadName} (${Math.round(busesPerHour)} buses/h)
- Traffic delay: ${Math.round(delayRatio * 100)}%
Recommend a priority adjustment (-10 to +10), summarize risks, and suggest actionable desk next steps.`;

  const aiResult = await runAi<AssessOutput>({
    feature: "G-ASSESS",
    promptVer: "v1.0",
    userPrompt: prompt,
    schema: AssessOutputSchema,
    inputPayload,
    factsForGrounding,
  });

  // Strict grounding validator check: reject and fallback if numbers are hallucinated
  if (!numbersGrounded(aiResult.data.summary, factsForGrounding)) {
    return getRulesFallback("G-ASSESS", inputPayload) as AssessOutput;
  }

  return aiResult.data;
}

// 2. G-BRIEF Schemas & Method
export const WardBriefSchema = z.object({
  wardCode: z.string(),
  wardName: z.string(),
  headline: z.string(),
  brief: z.string(),
  recommendedActions: z.array(z.string()),
});
export type WardBriefOutput = z.infer<typeof WardBriefSchema>;

export async function generateWardBrief(wardCode: string = "150"): Promise<WardBriefOutput> {
  const ward = await prisma.ward.findFirst({
    where: { code: wardCode },
    select: { id: true, name: true, code: true },
  });

  const wardName = ward?.name || `Ward ${wardCode}`;
  const openIssuesCount = await prisma.issue.count({
    where: {
      status: { in: [Status.OPEN, Status.IN_PROGRESS, Status.CONFIRMED] },
      ...(ward ? { wardId: ward.id } : {}),
    },
  });

  const highRiskCount = await prisma.issue.count({
    where: {
      status: { in: [Status.OPEN, Status.IN_PROGRESS, Status.CONFIRMED] },
      deteriorationScore: { gte: 70 },
      ...(ward ? { wardId: ward.id } : {}),
    },
  });

  const inputPayload = {
    wardCode,
    wardName,
    openIssuesCount,
    highRiskCount,
    rainPast24hMm: 12,
  };

  const quotaOk = await tryIncrementAnalystQuota();
  if (!quotaOk) {
    return getRulesFallback("G-BRIEF", inputPayload) as WardBriefOutput;
  }

  const prompt = `Synthesize morning briefing for ${wardName} (${wardCode}):
- Active open defects: ${openIssuesCount}
- High-risk defects: ${highRiskCount}
- Recent rain: 12 mm
Provide a crisp headline, brief summary, and 2 operational recommendations.`;

  const aiResult = await runAi<WardBriefOutput>({
    feature: "G-BRIEF",
    promptVer: "v1.0",
    userPrompt: prompt,
    schema: WardBriefSchema,
    inputPayload,
  });

  return aiResult.data;
}

// 3. G-AUDIT-ASSIST Schemas & Method
export const AuditAssistSchema = z.object({
  recommendation: z.enum(["ACCEPT_FIX", "REJECT_FIX", "DISPATCH_INSPECTOR"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  voteBreakdown: z.object({
    intact: z.number(),
    damaged: z.number(),
    cannotSee: z.number(),
  }),
});
export type AuditAssistOutput = z.infer<typeof AuditAssistSchema>;

export async function assistAudit(taskId: string): Promise<AuditAssistOutput> {
  const task = await prisma.auditTask.findUnique({
    where: { id: taskId },
    include: {
      votes: true,
      issue: {
        select: { id: true, contractorName: true, liabilityClauseRef: true },
      },
    },
  });

  const votes = task?.votes || [];
  const inputPayload = {
    taskId,
    votes: votes.map((v) => ({ observed: v.observed, weight: v.weight })),
    contractorName: task?.issue?.contractorName,
  };

  const quotaOk = await tryIncrementAnalystQuota();
  if (!quotaOk) {
    return getRulesFallback("G-AUDIT-ASSIST", inputPayload) as AuditAssistOutput;
  }

  const prompt = `Evaluate citizen blind repair audit for task ${taskId}:
Votes: ${JSON.stringify(inputPayload.votes)}
Recommend ACCEPT_FIX, REJECT_FIX, or DISPATCH_INSPECTOR with confidence and reasoning.`;

  const aiResult = await runAi<AuditAssistOutput>({
    feature: "G-AUDIT-ASSIST",
    promptVer: "v1.0",
    userPrompt: prompt,
    schema: AuditAssistSchema,
    inputPayload,
  });

  return aiResult.data;
}

// 4. Desk Analyst Chat Schemas & Method
export const ChatOutputSchema = z.object({
  answer: z.string(),
  citedIssueIds: z.array(z.string()),
  suggestedFollowups: z.array(z.string()),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export async function askDeskAnalyst(
  query: string,
  contextFilter?: { wardId?: string }
): Promise<ChatOutput> {
  // RAG Context retrieval: fetch top active issues and high-risk hotspots
  const issues = await prisma.issue.findMany({
    where: {
      status: { in: [Status.OPEN, Status.IN_PROGRESS, Status.CONFIRMED] },
      ...(contextFilter?.wardId ? { wardId: contextFilter.wardId } : {}),
    },
    orderBy: { priority: "desc" },
    take: 10,
    select: {
      id: true,
      category: true,
      priority: true,
      deteriorationScore: true,
      isHotspot: true,
      contractorName: true,
      segment: { select: { name: true, roadClass: true } },
    },
  });

  const inputPayload = {
    query,
    issues: issues.map((i) => ({
      id: i.id,
      category: i.category,
      priority: Math.round(i.priority),
      detScore: i.deteriorationScore,
      hotspot: i.isHotspot,
      road: i.segment?.name,
      contractor: i.contractorName,
    })),
  };

  const quotaOk = await tryIncrementAnalystQuota();
  if (!quotaOk) {
    return getRulesFallback("G-CHAT", inputPayload) as ChatOutput;
  }

  const prompt = `Desk Officer Query: "${query}"
Context Issues:
${JSON.stringify(inputPayload.issues, null, 2)}
Answer directly with actionable operational insight and cite relevant issue IDs like [#id].`;

  const aiResult = await runAi<ChatOutput>({
    feature: "G-CHAT",
    promptVer: "v1.0",
    userPrompt: prompt,
    schema: ChatOutputSchema,
    inputPayload,
  });

  return aiResult.data;
}

// 5. Scheduled Job: "ai-assess" (Top 50 Issues)
export async function runAiAssessJob(): Promise<{ assessedCount: number; failedCount: number }> {
  const topIssues = await prisma.issue.findMany({
    where: { status: { in: [Status.OPEN, Status.CONFIRMED, Status.IN_PROGRESS] } },
    orderBy: { priority: "desc" },
    take: 50,
    select: { id: true },
  });

  let assessed = 0;
  let failed = 0;

  for (const issue of topIssues) {
    try {
      await assessIssue(issue.id);
      assessed++;
    } catch {
      failed++;
    }
  }

  return { assessedCount: assessed, failedCount: failed };
}
