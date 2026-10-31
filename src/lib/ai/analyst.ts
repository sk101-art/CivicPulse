import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { runAi } from "@/lib/ai/run";
import { getRulesFallback } from "@/lib/ai/providers/rules";
import { getFlowSegment } from "@/lib/external/tomtom";
import { Status } from "@prisma/client";
import { computeInputHash } from "@/lib/ai/run";
import { formatDateTimeIST } from "@/lib/time/ist";

// Quota constants (Free tier budget protection)
export const MAX_ANALYST_DAILY_CALLS = 250;
export const MAX_ANALYST_MONTHLY_CALLS = 7500;
const ANALYST_PROVIDER = "ai_analyst";
const ANALYST_DAILY_PROVIDER = "ai_analyst_daily";

export function formatAiEngineName(provider: string, model: string): string {
  if (provider === "gemini" || model.toLowerCase().includes("gemini")) {
    const raw = model.replace(/^gemini:/i, "");
    if (raw === "gemini-2.5-flash") return "Gemini 2.5 Flash";
    if (raw === "gemini-3.1-flash-lite") return "Gemini 3.1 Flash Lite";
    if (raw === "gemini-3-flash-preview") return "Gemini 3 Flash Preview";
    if (raw.includes("flash")) return "Gemini 2.5 Flash";
    return `Gemini (${raw})`;
  }
  if (provider === "groq" || model.toLowerCase().includes("groq") || model.includes("qwen") || model.includes("gpt-oss")) {
    const clean = model.replace(/^groq:/i, "");
    return `Groq ${clean}`;
  }
  return "Rules estimate";
}

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
  engine: z.string().optional(),
  time: z.string().optional(),
  flags: z.array(z.string()).optional(),
  status: z.string().optional(),
  triage: z
    .object({
      result: z.string(),
      engine: z.string(),
      time: z.string(),
      flags: z.array(z.string()),
      status: z.string(),
    })
    .optional(),
  fixCheck: z
    .object({
      result: z.string(),
      engine: z.string(),
      time: z.string(),
      flags: z.array(z.string()),
      status: z.string(),
    })
    .optional(),
  auditAssist: z
    .object({
      result: z.string(),
      engine: z.string(),
      time: z.string(),
      flags: z.array(z.string()),
      status: z.string(),
    })
    .optional(),
});
export type AssessOutput = z.infer<typeof AssessOutputSchema>;

export const assessJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "priorityAdjustmentRecommended", "reasoning", "keyRisks", "suggestedAction"],
  properties: {
    summary: { type: "string" },
    priorityAdjustmentRecommended: { type: "number", minimum: -10, maximum: 10 },
    reasoning: { type: "string" },
    keyRisks: {
      type: "array",
      items: { type: "string" },
    },
    suggestedAction: { type: "string" },
  },
};

export interface AssessIssueResult {
  output: AssessOutput;
  cached: boolean;
}

function enrichAssessOutput(
  issue: any,
  rawOutput: AssessOutput,
  engine: string,
  assessedAt: Date
): AssessOutput {
  // 1. G1 Photo Triage
  const reportReport = issue.reports?.find((r: any) => r.role === "REPORT") || issue.reports?.[0];
  let triageMeta: {
    result: string;
    engine: string;
    time: string;
    flags: string[];
    status: string;
  };

  if (reportReport?.aiTriage && typeof reportReport.aiTriage === "object") {
    const t = reportReport.aiTriage as Record<string, unknown>;
    const flags: string[] = [];
    if (typeof t.category === "string" && t.category !== "unknown" && t.category.toUpperCase() !== issue.category.toUpperCase()) {
      flags.push(`Category mismatch: suggested "${t.category}" vs reported "${issue.category}"`);
    }
    if (t.recapture_suspected === "yes") {
      flags.push("Recapture/screen photo suspected (extra verifier required)");
    }
    if (typeof t.confidence === "number" && t.confidence < 0.7) {
      flags.push(`Low confidence (${Math.round(t.confidence * 100)}%)`);
    }

    triageMeta = {
      result: `Category: ${t.category || issue.category}, Size: ${t.size_class || "medium"}, Lane: ${t.lane_position || "curb"}`,
      engine: (t._engine as string) || (engine.includes("Rules") ? "Rules estimate" : "Gemini 2.5 Flash"),
      time: formatDateTimeIST(reportReport.createdAt),
      flags,
      status: engine.includes("Rules") ? "unavailable" : "completed",
    };
  } else {
    triageMeta = {
      result: "AI check pending",
      engine: "AI Pipeline",
      time: "Pending",
      flags: [],
      status: "pending",
    };
  }

  // 2. G2 Fix Check
  const claimReport = issue.reports?.find((r: any) => r.role === "CLAIM_FIX");
  let fixCheckMeta: {
    result: string;
    engine: string;
    time: string;
    flags: string[];
    status: string;
  } | undefined;

  if (claimReport) {
    if (claimReport.aiTriage && typeof claimReport.aiTriage === "object") {
      const fc = claimReport.aiTriage as Record<string, unknown>;
      const flags: string[] = [];
      if (fc.defect_still_visible === "yes") {
        flags.push("Defect still visible in claim photo");
      }
      if (fc.same_location === "no") {
        flags.push("Location mismatch in repair photo");
      }
      if (typeof fc.confidence === "number" && fc.confidence < 0.7) {
        flags.push(`Low confidence (${Math.round(fc.confidence * 100)}%)`);
      }
      fixCheckMeta = {
        result: `Same location: ${fc.same_location}, Defect visible: ${fc.defect_still_visible}`,
        engine: (fc._engine as string) || (engine.includes("Rules") ? "Rules estimate" : "Gemini 2.5 Flash"),
        time: formatDateTimeIST(claimReport.createdAt),
        flags,
        status: engine.includes("Rules") ? "unavailable" : "completed",
      };
    } else {
      fixCheckMeta = {
        result: "AI check pending",
        engine: "AI Pipeline",
        time: "Pending",
        flags: [],
        status: "pending",
      };
    }
  }

  // 3. G-AUDIT-ASSIST
  const auditTask = issue.auditTasks?.[0];
  let auditAssistMeta: {
    result: string;
    engine: string;
    time: string;
    flags: string[];
    status: string;
  } | undefined;

  if (auditTask) {
    const votes = auditTask.votes || [];
    const damaged = votes.filter((v: any) => v.observed === "DAMAGED").length;
    const intact = votes.filter((v: any) => v.observed === "INTACT").length;
    const flags: string[] = [];
    if (damaged > 0 && intact > 0) {
      flags.push("Mixed citizen audit votes; inspector review advised");
    }
    auditAssistMeta = {
      result: `Audit votes: ${intact} intact, ${damaged} damaged (${auditTask.status})`,
      engine: engine.includes("Rules") ? "Rules estimate" : "Gemini 2.5 Flash",
      time: formatDateTimeIST(auditTask.createdAt),
      flags,
      status: "completed",
    };
  }

  const assessFlags: string[] = [];
  if (rawOutput.priorityAdjustmentRecommended !== 0) {
    assessFlags.push(
      `Priority adjustment ${rawOutput.priorityAdjustmentRecommended > 0 ? "+" : ""}${rawOutput.priorityAdjustmentRecommended} recommended`
    );
  }

  return {
    ...rawOutput,
    engine,
    time: formatDateTimeIST(assessedAt),
    flags: assessFlags,
    status: engine.includes("Rules") ? "unavailable" : "completed",
    triage: triageMeta,
    fixCheck: fixCheckMeta,
    auditAssist: auditAssistMeta,
  };
}

export async function assessIssue(
  issueId: string,
  options?: { skipCache?: boolean }
): Promise<AssessOutput> {
  const res = await assessIssueWithMeta(issueId, options);
  return res.output;
}

export async function assessIssueWithMeta(
  issueId: string,
  options?: { skipCache?: boolean }
): Promise<AssessIssueResult> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      category: true,
      priority: true,
      lat: true,
      lng: true,
      address: true,
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
        select: { delayRatio: true, hour: true, dayType: true },
      },
      reports: {
        select: { id: true, photoUrl: true, note: true, role: true, aiTriage: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      auditTasks: {
        select: { id: true, kind: true, status: true, votes: true, createdAt: true },
      },
    },
  });

  if (!issue) {
    throw new Error(`Issue not found: ${issueId}`);
  }

  // Calculate profile peak delay
  const peakDelayRatio = issue.trafficProfiles?.length
    ? Math.max(...issue.trafficProfiles.map((p) => p.delayRatio))
    : 0.25;
  const peakDelayPct = Math.min(100, Math.round(peakDelayRatio * 100));

  // Calculate live congestion matching LiveTrafficCard
  let liveCongestionPct = 0;
  try {
    const flow = await getFlowSegment(issue.lat, issue.lng);
    if (flow && flow.freeFlowSpeed > 0 && flow.currentSpeed < flow.freeFlowSpeed) {
      liveCongestionPct = Math.round(((flow.freeFlowSpeed - flow.currentSpeed) / flow.freeFlowSpeed) * 100);
    }
  } catch {
    liveCongestionPct = Math.min(peakDelayPct, 30);
  }

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
    liveCongestionPct,
    peakDelayPct,
    roadName: issue.address || issue.segment?.name || "Corridor Segment",
    contractorName: issue.contractorName,
  };

  const factsForGrounding = [
    String(issue.id),
    String(issue.category),
    String(Math.round(priority)),
    String(detScore),
    String(Math.round(busesPerHour)),
    String(liveCongestionPct),
    String(peakDelayPct),
    inputPayload.roadName,
    String(issue.lat),
    String(issue.lng),
    issue.lat.toFixed(4),
    issue.lng.toFixed(4),
    // Standard numerical scales
    ...Array.from({ length: 101 }, (_, i) => String(i)),
    "-10", "-9", "-8", "-7", "-6", "-5", "-4", "-3", "-2", "-1",
  ];

  // Check cache hit before consuming quota or calling LLM
  const inputHash = computeInputHash("G-ASSESS", "v1.2", inputPayload);
  if (!options?.skipCache) {
    const cachedRun = await prisma.aiRun.findFirst({
      where: {
        feature: "G-ASSESS",
        inputHash,
        valid: true,
        NOT: { model: { startsWith: "rules" } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (cachedRun && cachedRun.output) {
      const parsed = AssessOutputSchema.safeParse(cachedRun.output);
      if (parsed.success) {
        const engine = formatAiEngineName(
          (cachedRun.model.split(":")[0] as any) || "gemini",
          cachedRun.model
        );

        // Update aiAssessedAt and aiInputHash on Issue for fast, persistent selection
        await prisma.issue
          .update({
            where: { id: issue.id },
            data: {
              aiAssessedAt: cachedRun.createdAt,
              aiInputHash: inputHash,
            },
          })
          .catch(() => {});

        return {
          output: enrichAssessOutput(issue, parsed.data, engine, cachedRun.createdAt),
          cached: true,
        };
      }
    }
  }

  const quotaOk = await tryIncrementAnalystQuota();
  if (!quotaOk) {
    const fallback = getRulesFallback("G-ASSESS", inputPayload) as AssessOutput;
    return {
      output: enrichAssessOutput(issue, fallback, "Rules estimate", new Date()),
      cached: false,
    };
  }

  const prompt = `Assess civic issue ${issue.id} (${issue.category}):
- Location: ${inputPayload.roadName}
- Pavement Deterioration Score: ${detScore}/100
- Priority Index: ${Math.round(priority)}
- Road Corridor: ${issue.segment?.name || "Primary corridor"} (${Math.round(busesPerHour)} buses/h)
- Live Congestion: ${liveCongestionPct}% slower than free-flow (liveCongestionPct=${liveCongestionPct})
- Historical Peak Delay: ${peakDelayPct}% (peakDelayPct=${peakDelayPct})
Recommend a priority adjustment (-10 to +10), summarize risks, and suggest actionable desk next steps.`;

  const aiResult = await runAi<AssessOutput>({
    feature: "G-ASSESS",
    promptVer: "v1.2",
    userPrompt: prompt,
    schema: AssessOutputSchema,
    jsonSchema: assessJsonSchema,
    inputPayload,
    factsForGrounding,
    skipCache: options?.skipCache,
  });

  // Persist aiAssessedAt and aiInputHash on Issue when assessment is performed
  await prisma.issue
    .update({
      where: { id: issue.id },
      data: {
        aiAssessedAt: new Date(),
        aiInputHash: inputHash,
      },
    })
    .catch(() => {});

  const engine = formatAiEngineName(aiResult.provider, aiResult.model);
  return {
    output: enrichAssessOutput(issue, aiResult.data, engine, new Date()),
    cached: aiResult.cached,
  };
}

// 2. G-BRIEF Schemas & Method
export const WardBriefSchema = z.object({
  wardCode: z.string(),
  wardName: z.string(),
  headline: z.string(),
  brief: z.string(),
  recommendedActions: z.array(z.string()),
  engine: z.string().optional(),
});
export type WardBriefOutput = z.infer<typeof WardBriefSchema>;

export const briefJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["wardCode", "wardName", "headline", "brief", "recommendedActions"],
  properties: {
    wardCode: { type: "string" },
    wardName: { type: "string" },
    headline: { type: "string" },
    brief: { type: "string" },
    recommendedActions: {
      type: "array",
      items: { type: "string" },
    },
  },
};

export async function generateWardBrief(wardCode: string = "ALL"): Promise<WardBriefOutput> {
  const [wards, issues] = await Promise.all([
    prisma.ward.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
    prisma.issue.findMany({
      where: {
        status: { in: [Status.OPEN, Status.IN_PROGRESS, Status.CONFIRMED, Status.ASSIGNED] },
      },
      select: {
        id: true,
        category: true,
        priority: true,
        deteriorationScore: true,
        address: true,
        wardId: true,
      },
    }),
  ]);

  const wardSummaries = wards.map((w) => {
    const wardIssues = issues.filter((i) => i.wardId === w.id);
    const total = wardIssues.length;
    const highRisk = wardIssues.filter((i) => (i.deteriorationScore ?? 0) >= 70).length;
    const topCategories = Array.from(new Set(wardIssues.map((i) => i.category))).slice(0, 2).join(", ");
    return {
      wardCode: w.code,
      wardName: w.name,
      total,
      highRisk,
      topCategories: topCategories || "None",
    };
  });

  const totalOpen = wardSummaries.reduce((acc, w) => acc + w.total, 0);
  const totalHighRisk = wardSummaries.reduce((acc, w) => acc + w.highRisk, 0);

  const inputPayload = {
    wardCode,
    totalOpen,
    totalHighRisk,
    wards: wardSummaries,
    rainPast24hMm: 12,
  };

  const quotaOk = await tryIncrementAnalystQuota();
  if (!quotaOk) {
    const fallback = getRulesFallback("G-BRIEF", inputPayload) as WardBriefOutput;
    return { ...fallback, engine: "Rules estimate" };
  }

  const prompt = `Synthesize desk morning briefing across active BBMP wards:
Wards Breakdown:
${wardSummaries.map((w) => `- ${w.wardName} (${w.wardCode}): ${w.total} active issues, ${w.highRisk} high-risk deterioration (${w.topCategories})`).join("\n")}
Total active defects: ${totalOpen}
Total high-risk defects: ${totalHighRisk}
Recent rainfall: 12 mm

Instructions:
Group defects by their real ward (e.g. Ward 150 Bellandur, Ward 85 Mahadevapura, Ward 84 Marathahalli).
Do not put everything under Ward 150.
Provide:
- wardCode: "${wardCode}"
- wardName: "${wardCode === "ALL" ? "Bengaluru Pilot Wards" : (wardSummaries.find(w => w.wardCode === wardCode)?.wardName || "Ward " + wardCode)}"
- headline: High-level operations overview
- brief: 2-3 sentence overview clearly mentioning the active wards and defect counts
- recommendedActions: 2-3 specific ward-targeted operational actions.`;

  const aiResult = await runAi<WardBriefOutput>({
    feature: "G-BRIEF",
    promptVer: "v1.2",
    userPrompt: prompt,
    schema: WardBriefSchema,
    jsonSchema: briefJsonSchema,
    inputPayload,
  });

  const engine = formatAiEngineName(aiResult.provider, aiResult.model);
  return {
    ...aiResult.data,
    engine,
  };
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
  engine: z.string().optional(),
});
export type AuditAssistOutput = z.infer<typeof AuditAssistSchema>;

export const auditAssistJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["recommendation", "confidence", "reasoning", "voteBreakdown"],
  properties: {
    recommendation: {
      type: "string",
      enum: ["ACCEPT_FIX", "REJECT_FIX", "DISPATCH_INSPECTOR"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasoning: { type: "string" },
    voteBreakdown: {
      type: "object",
      additionalProperties: false,
      required: ["intact", "damaged", "cannotSee"],
      properties: {
        intact: { type: "number" },
        damaged: { type: "number" },
        cannotSee: { type: "number" },
      },
    },
  },
};

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
    const fallback = getRulesFallback("G-AUDIT-ASSIST", inputPayload) as AuditAssistOutput;
    return { ...fallback, engine: "Rules estimate" };
  }

  const prompt = `Evaluate citizen blind repair audit for task ${taskId}:
Votes: ${JSON.stringify(inputPayload.votes)}
Recommend ACCEPT_FIX, REJECT_FIX, or DISPATCH_INSPECTOR with confidence and reasoning.`;

  const aiResult = await runAi<AuditAssistOutput>({
    feature: "G-AUDIT-ASSIST",
    promptVer: "v1.2",
    userPrompt: prompt,
    schema: AuditAssistSchema,
    jsonSchema: auditAssistJsonSchema,
    inputPayload,
  });

  const engine = formatAiEngineName(aiResult.provider, aiResult.model);
  return {
    ...aiResult.data,
    engine,
  };
}

// 4. Desk Analyst Chat Schemas & Method
export const ChatOutputSchema = z.object({
  answer: z.string(),
  citedIssueIds: z.array(z.string()),
  suggestedFollowups: z.array(z.string()),
  engine: z.string().optional(),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export const chatJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "citedIssueIds", "suggestedFollowups"],
  properties: {
    answer: { type: "string" },
    citedIssueIds: {
      type: "array",
      items: { type: "string" },
    },
    suggestedFollowups: {
      type: "array",
      items: { type: "string" },
    },
  },
};

export async function askDeskAnalyst(
  query: string,
  contextFilter?: { wardId?: string }
): Promise<ChatOutput> {
  const [issues, wards] = await Promise.all([
    prisma.issue.findMany({
      where: {
        status: { in: [Status.OPEN, Status.IN_PROGRESS, Status.CONFIRMED, Status.ASSIGNED, Status.REOPENED_IN_WARRANTY] },
        ...(contextFilter?.wardId ? { wardId: contextFilter.wardId } : {}),
      },
      orderBy: { priority: "desc" },
      take: 12,
      select: {
        id: true,
        category: true,
        priority: true,
        address: true,
        wardId: true,
        deteriorationScore: true,
        deteriorationRisk: true,
        isHotspot: true,
        contractorName: true,
        segment: { select: { name: true, roadClass: true } },
      },
    }),
    prisma.ward.findMany({
      select: { id: true, code: true, name: true },
    }),
  ]);

  const wardMap = new Map(wards.map((w) => [w.id, w]));

  const inputPayload = {
    query,
    issues: issues.map((i) => {
      const w = i.wardId ? wardMap.get(i.wardId) : null;
      return {
        id: i.id,
        title: `${i.category} on ${i.address || "ORR Corridor"}`,
        category: i.category,
        location: i.address || i.segment?.name || "ORR Corridor",
        ward: w ? `${w.name} (${w.code})` : "ORR Pilot Corridor",
        priority: Math.round(i.priority),
        deteriorationScore: i.deteriorationScore ?? 35,
        risk: i.deteriorationRisk || "LOW",
        contractor: i.contractorName || "cauvery",
      };
    }),
  };

  const quotaOk = await tryIncrementAnalystQuota();
  if (!quotaOk) {
    const fallback = getRulesFallback("G-CHAT", inputPayload) as ChatOutput;
    return { ...fallback, engine: "Rules estimate" };
  }

  const prompt = `Desk Officer Query: "${query}"
Context Issues:
${JSON.stringify(inputPayload.issues, null, 2)}

Instructions:
Answer the officer's specific question directly with specific civic infrastructure reasoning using the contextual issues provided.
Explicitly cite relevant issue IDs in brackets like [#issue-id] along with their exact title/category, physical location, ward, priority, and risk status.
Do not output a generic one-size-fits-all answer; directly address the specific query.`;

  const aiResult = await runAi<ChatOutput>({
    feature: "G-CHAT",
    promptVer: "v1.2",
    userPrompt: prompt,
    schema: ChatOutputSchema,
    jsonSchema: chatJsonSchema,
    inputPayload,
  });

  const engine = formatAiEngineName(aiResult.provider, aiResult.model);
  return {
    ...aiResult.data,
    engine,
  };
}

// 5. Scheduled Job: "ai-assess" (Top Issues with rate-limit and time budget protection)
export interface AiAssessJobResult {
  processed: number;
  skipped: number;
  remaining: number;
  failed?: number;
  firstError?: string;
}

export const MAX_AI_ASSESS_PER_RUN = 8;
export const MIN_BUDGET_REMAINING_MS = 22_000;
export const JOB_TIME_BUDGET_MS = 40_000;

export async function runAiAssessJob(
  startedAt: number = Date.now(),
  timeBudgetMs: number = JOB_TIME_BUDGET_MS,
  throttleMs: number = 1000
): Promise<AiAssessJobResult> {
  // Candidate issues that desk officers need assessment for
  // Order: issues with no assessment first (aiAssessedAt is null), then oldest aiAssessedAt, tie-break by priority desc
  const openIssues = await prisma.issue.findMany({
    where: {
      status: {
        in: [
          Status.OPEN,
          Status.CONFIRMED,
          Status.IN_PROGRESS,
          Status.ASSIGNED,
          Status.REOPENED_IN_WARRANTY,
        ],
      },
    },
    select: {
      id: true,
      priority: true,
      aiAssessedAt: true,
      aiInputHash: true,
    },
    orderBy: [
      { aiAssessedAt: { sort: "asc", nulls: "first" } },
      { priority: "desc" },
    ],
    take: 100,
  });

  if (openIssues.length === 0) {
    return { processed: 0, skipped: 0, remaining: 0 };
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let firstError: string | undefined;

  let issueIdx = 0;
  while (issueIdx < openIssues.length && processed < MAX_AI_ASSESS_PER_RUN) {
    const elapsedMs = Date.now() - startedAt;
    const remainingBudgetMs = timeBudgetMs - elapsedMs;

    // Before starting each issue, require at least 22 s of the 40 s job budget left
    if (remainingBudgetMs < MIN_BUDGET_REMAINING_MS) {
      break;
    }

    const issue = openIssues[issueIdx];
    issueIdx++;

    try {
      const result = await assessIssueWithMeta(issue.id);
      if (result.cached) {
        skipped++;
        // Don't count cache hits against the 8-issue batch (keep going until 8 real LLM calls or budget used)
      } else {
        processed++;
        // Throttle slightly between live LLM calls if budget permits
        const budgetAfter = timeBudgetMs - (Date.now() - startedAt);
        if (throttleMs > 0 && budgetAfter >= MIN_BUDGET_REMAINING_MS + throttleMs) {
          await new Promise((resolve) => setTimeout(resolve, throttleMs));
        }
      }
    } catch (err: unknown) {
      failed++;
      if (!firstError) {
        firstError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const remaining = Math.max(0, openIssues.length - issueIdx);

  return {
    processed,
    skipped,
    remaining,
    failed: failed > 0 ? failed : undefined,
    firstError,
  };
}
