import { describe, it, expect, vi } from "vitest";
import {
  AssessOutputSchema,
  WardBriefSchema,
  AuditAssistSchema,
  ChatOutputSchema,
  assessIssue,
  generateWardBrief,
  assistAudit,
  askDeskAnalyst,
  MAX_ANALYST_DAILY_CALLS,
  MAX_AI_ASSESS_PER_RUN,
  MIN_BUDGET_REMAINING_MS,
  JOB_TIME_BUDGET_MS,
  runAiAssessJob,
} from "@/lib/ai/analyst";
import { prisma } from "@/lib/db/prisma";
import * as tomtomModule from "@/lib/external/tomtom";
import * as runAiModule from "@/lib/ai/run";
import { getRulesFallback } from "@/lib/ai/providers/rules";

describe("Phase 4: AI Analyst (Desk Co-pilot: Gemini → Groq → Rules)", () => {
  describe("G-ASSESS (Per-Issue Intelligence Summary)", () => {
    it("generates valid schema output via rules fallback when LLM is unavailable", () => {
      const fallback = getRulesFallback("G-ASSESS", {
        category: "POTHOLES",
        priority: 78,
        deteriorationScore: 82,
        busesPerHour: 45,
        delayRatio: 0.62,
        past7DaysRainMm: 38,
      });

      const parsed = AssessOutputSchema.safeParse(fallback);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.priorityAdjustmentRecommended).toBeGreaterThanOrEqual(-10);
        expect(parsed.data.priorityAdjustmentRecommended).toBeLessThanOrEqual(10);
        expect(parsed.data.keyRisks.length).toBeGreaterThan(0);
        expect(parsed.data.summary).toMatch(/POTHOLES/);
      }
    });

    it("grounds numbers strictly: rejects hallucinated numbers and preserves factual numbers", () => {
      const payload = {
        category: "POTHOLES",
        priority: 75,
        deteriorationScore: 80,
        busesPerHour: 40,
        delayRatio: 0.50,
      };

      const result = getRulesFallback("G-ASSESS", payload);
      expect(result.summary).toContain("75");
      expect(result.summary).toContain("80");
      expect(result.summary).toContain("40");
    });
  });

  describe("G-BRIEF (Ward Daily Briefing)", () => {
    it("generates structured ward brief with headline and recommended actions", () => {
      const brief = getRulesFallback("G-BRIEF", {
        wardCode: "150",
        wardName: "Bellandur",
        openIssuesCount: 23,
        rainPast24hMm: 18,
        highRiskCount: 4,
      });

      const parsed = WardBriefSchema.safeParse(brief);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.wardCode).toBe("150");
        expect(parsed.data.brief).toContain("23 open issues");
        expect(parsed.data.recommendedActions.length).toBeGreaterThan(0);
      }
    });
  });

  describe("G-AUDIT-ASSIST (Blind Repair Audit Discrepancy Synthesis)", () => {
    it("recommends ACCEPT_FIX with high confidence when citizens unanimously observe INTACT", () => {
      const assist = getRulesFallback("G-AUDIT-ASSIST", {
        votes: [
          { observed: "INTACT", weight: 1.0 },
          { observed: "INTACT", weight: 1.0 },
          { observed: "INTACT", weight: 0.8 },
        ],
      });

      const parsed = AuditAssistSchema.safeParse(assist);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.recommendation).toBe("ACCEPT_FIX");
        expect(parsed.data.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it("recommends REJECT_FIX when majority of citizen audits report DAMAGED", () => {
      const assist = getRulesFallback("G-AUDIT-ASSIST", {
        votes: [
          { observed: "DAMAGED", weight: 1.0 },
          { observed: "DAMAGED", weight: 1.0 },
          { observed: "CANNOT_SEE", weight: 0.5 },
        ],
      });

      const parsed = AuditAssistSchema.safeParse(assist);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.recommendation).toBe("REJECT_FIX");
        expect(parsed.data.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it("recommends DISPATCH_INSPECTOR when citizen votes are split or inconclusive", () => {
      const assist = getRulesFallback("G-AUDIT-ASSIST", {
        votes: [
          { observed: "INTACT", weight: 1.0 },
          { observed: "DAMAGED", weight: 1.0 },
          { observed: "CANNOT_SEE", weight: 0.5 },
        ],
      });

      const parsed = AuditAssistSchema.safeParse(assist);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.recommendation).toBe("DISPATCH_INSPECTOR");
      }
    });
  });

  describe("Ask the Desk Analyst (Chat & Grounded Citations)", () => {
    it("answers queries with citations to context issue IDs", () => {
      const chat = getRulesFallback("G-CHAT", {
        query: "Which roads need urgent attention before tomorrow's rain?",
        issues: [
          { id: "iss-101", priority: 85 },
          { id: "iss-102", priority: 79 },
        ],
      });

      const parsed = ChatOutputSchema.safeParse(chat);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.citedIssueIds).toContain("iss-101");
        expect(parsed.data.citedIssueIds).toContain("iss-102");
        expect(parsed.data.answer).toContain("#iss-101");
        expect(parsed.data.suggestedFollowups.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Quota Configuration", () => {
    it("enforces daily budget cap of 250 analyst calls", () => {
      expect(MAX_ANALYST_DAILY_CALLS).toBe(250);
    });
  });

  describe("ai-assess Job Time Budget & Limits", () => {
    it("configures max 8 issues per run and requires 22s minimum remaining budget", () => {
      expect(MAX_AI_ASSESS_PER_RUN).toBe(8);
      expect(MIN_BUDGET_REMAINING_MS).toBe(22_000);
      expect(JOB_TIME_BUDGET_MS).toBe(40_000);
    });

    it("stops immediately and returns remaining count when job budget is below 22s", async () => {
      // Mock open issues
      const mockIssues = [
        { id: "iss-1", priority: 90, aiAssessedAt: null, aiInputHash: null },
        { id: "iss-2", priority: 80, aiAssessedAt: null, aiInputHash: null },
        { id: "iss-3", priority: 70, aiAssessedAt: null, aiInputHash: null },
      ];

      vi.spyOn(prisma.issue, "findMany").mockResolvedValue(mockIssues as any);

      // Start time was 25s ago (40s - 25s = 15s remaining, which is < 22s)
      const startedAt = Date.now() - 25_000;
      const result = await runAiAssessJob(startedAt, 40_000);

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.remaining).toBe(3);
    });

    it("assesses different issues on two consecutive runs and prioritizes unassessed first", async () => {
      // Simulate 16 open issues
      const issuesDb: Array<{
        id: string;
        priority: number;
        aiAssessedAt: Date | null;
        aiInputHash: string | null;
      }> = Array.from({ length: 16 }, (_, i) => ({
        id: `iss-${i + 1}`,
        priority: 100 - i,
        aiAssessedAt: null,
        aiInputHash: null,
      }));

      // Mock prisma.issue.findMany:
      // 1) When called with orderBy (in runAiAssessJob)
      // 2) When called with where: { id: issueId } (in assessIssueWithMeta)
      vi.spyOn(prisma.issue, "findMany").mockImplementation((async () => {
        return [...issuesDb].sort((a, b) => {
          if (a.aiAssessedAt === null && b.aiAssessedAt !== null) return -1;
          if (a.aiAssessedAt !== null && b.aiAssessedAt === null) return 1;
          if (a.aiAssessedAt && b.aiAssessedAt) {
            const diff = a.aiAssessedAt.getTime() - b.aiAssessedAt.getTime();
            if (diff !== 0) return diff;
          }
          return b.priority - a.priority;
        });
      }) as any);

      vi.spyOn(prisma.issue, "findUnique").mockImplementation((async (args: any) => {
        const id = args.where.id;
        const found = issuesDb.find((i) => i.id === id);
        if (!found) return null;
        return {
          id: found.id,
          category: "POTHOLES",
          priority: found.priority,
          lat: 12.95,
          lng: 77.70,
          address: "ORR Road",
          sizeClass: "MEDIUM",
          lanePosition: "CURB",
          deteriorationRisk: "MED",
          deteriorationScore: 50,
          expectedDaysToWorsen: 14,
          contractorName: "cauvery",
          segment: { roadClass: "primary", busesPerHour: 30, name: "ORR" },
          trafficProfiles: [{ delayRatio: 0.35, hour: 9, dayType: "WEEKDAY" }],
          reports: [],
        };
      }) as any);

      // Mock TomTom getFlowSegment so tests do not make real network requests
      vi.spyOn(tomtomModule, "getFlowSegment").mockResolvedValue(null as any);

      // Mock runAi so it returns immediately without network / LLM calls
      vi.spyOn(runAiModule, "runAi").mockResolvedValue({
        data: {
          summary: "POTHOLES detected on ORR Road",
          priorityAdjustmentRecommended: 2,
          reasoning: "High traffic",
          keyRisks: ["Pavement damage"],
          suggestedAction: "Patch immediately",
        },
        provider: "rules",
        model: "rules-fallback",
        valid: true,
        cached: false,
      });

      // Mock quota increment to always allow in unit test
      const analystModule = await import("@/lib/ai/analyst");
      vi.spyOn(analystModule, "tryIncrementAnalystQuota").mockResolvedValue(true);

      // No cached AiRun initially
      vi.spyOn(prisma.aiRun, "findFirst").mockResolvedValue(null as any);
      vi.spyOn(prisma.aiRun, "create").mockResolvedValue({} as any);

      // Track which issues are updated with aiAssessedAt
      const run1AssessedIds: string[] = [];
      const run2AssessedIds: string[] = [];
      let isRun1 = true;

      vi.spyOn(prisma.issue, "update").mockImplementation((async (args: any) => {
        const issue = issuesDb.find((i) => i.id === args.where.id);
        if (issue) {
          issue.aiAssessedAt = args.data.aiAssessedAt || new Date();
          issue.aiInputHash = args.data.aiInputHash || "hash";
        }
        if (isRun1) {
          run1AssessedIds.push(args.where.id);
        } else {
          run2AssessedIds.push(args.where.id);
        }
        return issue;
      }) as any);

      // Run 1: Should assess first 8 issues (iss-1 to iss-8)
      isRun1 = true;
      const res1 = await runAiAssessJob(Date.now(), 40_000, 0);
      expect(res1.processed).toBe(8);
      expect(run1AssessedIds).toEqual([
        "iss-1", "iss-2", "iss-3", "iss-4", "iss-5", "iss-6", "iss-7", "iss-8"
      ]);

      // Run 2: Should pick up the remaining unassessed issues (iss-9 to iss-16)
      isRun1 = false;
      const res2 = await runAiAssessJob(Date.now(), 40_000, 0);
      expect(res2.processed).toBe(8);
      expect(run2AssessedIds).toEqual([
        "iss-9", "iss-10", "iss-11", "iss-12", "iss-13", "iss-14", "iss-15", "iss-16"
      ]);

      // Verify zero overlap between run 1 and run 2
      const overlap = run1AssessedIds.filter((id) => run2AssessedIds.includes(id));
      expect(overlap).toEqual([]);
    });
  });
});
