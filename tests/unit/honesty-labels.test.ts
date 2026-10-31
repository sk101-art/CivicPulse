import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import { Category, EvidenceRole, Status, Band, Prisma } from "@prisma/client";
import { formatEvidenceCount } from "@/lib/format/evidence";
import { getElapsedTime } from "@/lib/format/elapsed";
import { formatAiEngineName, engineFromAiRunModel, UNKNOWN_ENGINE, RULES_ENGINE } from "@/lib/ai/engineName";
import { assessIssueWithMeta } from "@/lib/ai/analyst";
import { processG1Triage } from "@/lib/ai/triage";
import { computeInputHash } from "@/lib/ai/run";
import { GET as logGET } from "@/app/api/issues/[id]/log/route";
import { LlmAdapter, LlmGenerateResult } from "@/lib/external/llm/types";
import { upsertSeedReport, demoPhotoForCategory } from "../../prisma/seed-evidence";

describe("Evidence count (IssueDrawer)", () => {
  it("shows 'No evidence yet' for zero reports instead of inflating to 1", () => {
    expect(formatEvidenceCount({ _count: { reports: 0 }, reports: [] })).toBe("No evidence yet");
    expect(formatEvidenceCount({ reports: [] })).toBe("No evidence yet");
    expect(formatEvidenceCount({})).toBe("No evidence yet");
  });

  it("shows the true count", () => {
    expect(formatEvidenceCount({ _count: { reports: 1 } })).toBe("1 evidence report");
    expect(formatEvidenceCount({ _count: { reports: 3 }, reports: [{}] })).toBe("3 evidence reports");
    expect(formatEvidenceCount({ reports: [{}, {}] })).toBe("2 evidence reports");
  });

  it("drawer no longer clamps the count with Math.max(1, …)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/desk/IssueDrawer.tsx"), "utf-8");
    expect(src).not.toMatch(/Math\.max\(1,[^)]*reports/);
    expect(src).toContain("formatEvidenceCount(issue)");
  });
});

describe("Seed evidence (data fix for issues with zero reports)", () => {
  it("every previously report-less seed issue now gets an original REPORT", () => {
    const seed = fs.readFileSync(path.join(process.cwd(), "prisma/seed.ts"), "utf-8");
    const demo = fs.readFileSync(path.join(process.cwd(), "scripts/seed-demo.ts"), "utf-8");
    for (const src of [seed, demo]) {
      expect(src).toContain("id: 'seed-report-orr-fixed'");
      expect(src).toContain("id: 'seed-report-orr-recurrence'");
    }
    // Claim-gap scorecard issues
    expect(demo).toContain("id: `seed-report-${c.id}`");
  });

  it("uses a matching demo photo or the explicit photo-missing placeholder, never a mismatched image", () => {
    expect(demoPhotoForCategory(Category.POTHOLES)).toContain("demo-evidence-potholes.jpg");
    expect(demoPhotoForCategory(Category.DRAINAGE)).toContain("photo-missing.jpg");
  });

  it("upsertSeedReport creates a REPORT row so the evidence count is truthful", async () => {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Seed user required");
    const issue = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        status: Status.VERIFIED_FIXED,
        lat: 12.95,
        lng: 77.7,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        isSeed: true,
      },
    });
    try {
      const before = await prisma.issue.findUnique({ where: { id: issue.id }, include: { _count: { select: { reports: true } } } });
      expect(formatEvidenceCount(before!)).toBe("No evidence yet");

      const input = {
        id: `seed-report-test-${issue.id}`,
        issueId: issue.id,
        userId: user.id,
        category: Category.DRAINAGE,
        lat: 12.95,
        lng: 77.7,
        capturedAt: new Date(),
        note: "test",
      };
      await upsertSeedReport(prisma, input);
      await upsertSeedReport(prisma, input); // idempotent

      const after = await prisma.issue.findUnique({ where: { id: issue.id }, include: { _count: { select: { reports: true } } } });
      expect(after!._count.reports).toBe(1);
      expect(formatEvidenceCount(after!)).toBe("1 evidence report");
    } finally {
      await prisma.report.deleteMany({ where: { issueId: issue.id } });
      await prisma.issue.delete({ where: { id: issue.id } }).catch(() => {});
    }
  });
});

describe("Elapsed time (StatusTimeline)", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");

  it("returns '—' when there is no start time, not '0h'", () => {
    expect(getElapsedTime(null, null, now)).toBe("—");
    expect(getElapsedTime(null, "2026-10-31T11:00:00Z", now)).toBe("—");
    expect(getElapsedTime("not-a-date", null, now)).toBe("—");
  });

  it("formats real durations", () => {
    expect(getElapsedTime("2026-10-31T11:59:50Z", null, now)).toBe("0m");
    expect(getElapsedTime("2026-10-31T10:30:00Z", null, now)).toBe("1h 30m");
    expect(getElapsedTime("2026-10-29T10:00:00Z", "2026-10-31T12:00:00Z", now)).toBe("2d 2h");
  });

  it("StatusTimeline uses the shared helper", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/authority/StatusTimeline.tsx"), "utf-8");
    expect(src).not.toContain("return '0h'");
    expect(src).toContain("from '@/lib/format/elapsed'");
  });
});

describe("AI engine labels", () => {
  it("maps known Gemini ids and shows unrecognised ones verbatim (never as 2.5 Flash)", () => {
    expect(formatAiEngineName("gemini", "gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
    expect(formatAiEngineName("gemini", "gemini:gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
    expect(formatAiEngineName("gemini", "gemini-3.1-flash-lite")).toBe("Gemini 3.1 Flash Lite");
    expect(formatAiEngineName("gemini", "gemini-2.0-flash")).toBe("Gemini (gemini-2.0-flash)");
    expect(formatAiEngineName("gemini", "gemini-2.5-flash-lite")).toBe("Gemini (gemini-2.5-flash-lite)");
    expect(formatAiEngineName("gemini", "gemini:gemini-9-ultra")).toBe("Gemini (gemini-9-ultra)");
  });

  it("labels rules, groq and unknown engines honestly", () => {
    expect(formatAiEngineName("rules", "rules-fallback")).toBe(RULES_ENGINE);
    expect(formatAiEngineName("groq", "qwen/qwen3-32b")).toBe("Groq qwen/qwen3-32b");
    expect(formatAiEngineName("", "")).toBe(UNKNOWN_ENGINE);
    expect(formatAiEngineName(undefined, undefined)).toBe(UNKNOWN_ENGINE);
    expect(formatAiEngineName("mystery", "model-x")).toBe(UNKNOWN_ENGINE);
    expect(engineFromAiRunModel("gemini:gemini-3-flash-preview")).toBe("Gemini 3 Flash Preview");
    expect(engineFromAiRunModel("rules-fallback")).toBe(RULES_ENGINE);
    expect(engineFromAiRunModel(null)).toBe(UNKNOWN_ENGINE);
  });

  it("no hard-coded 'Gemini 2.5 Flash' fallback remains outside the formatter", () => {
    for (const file of [
      "src/lib/ai/analyst.ts",
      "src/components/desk/IssueDrawer.tsx",
      "src/components/desk/DeskAnalystPanel.tsx",
      "src/app/api/issues/[id]/log/route.ts",
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), file), "utf-8");
      expect(src, file).not.toContain("Gemini 2.5 Flash");
    }
  });

  describe("G1/G2 engine comes from the recorded run", () => {
    // assessIssueWithMeta makes live traffic/LLM calls; allow for provider latency.
    vi.setConfig({ testTimeout: 30000 });
    const issueIds: string[] = [];
    const aiRunIds: string[] = [];
    let userId: string;

    beforeAll(async () => {
      const user = await prisma.user.findFirst();
      if (!user) throw new Error("Seed user required");
      userId = user.id;
    });

    afterAll(async () => {
      await prisma.aiRun.deleteMany({ where: { id: { in: aiRunIds } } }).catch(() => {});
      for (const id of issueIds) {
        await prisma.actionLog.deleteMany({ where: { issueId: id } }).catch(() => {});
        await prisma.report.deleteMany({ where: { issueId: id } }).catch(() => {});
        await prisma.issue.delete({ where: { id } }).catch(() => {});
      }
    });

    async function makeIssue(category: Category, status: Status) {
      const issue = await prisma.issue.create({
        data: {
          category,
          status,
          lat: 12.931,
          lng: 77.681,
          address: "Engine Label Test Road",
          priority: 40,
          band: Band.MEDIUM,
          slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
      });
      issueIds.push(issue.id);
      return issue;
    }

    async function makeReport(issueId: string, role: EvidenceRole, sha: string, aiTriage?: object) {
      return prisma.report.create({
        data: {
          issueId,
          userId,
          role,
          photoUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          photoSha256: sha,
          signature: "sig",
          lat: 12.931,
          lng: 77.681,
          gpsAccuracyM: 4,
          capturedAt: new Date(),
          aiTriage: aiTriage as Prisma.InputJsonValue | undefined,
        },
      });
    }

    const g1Triage = { category: "POTHOLES", size_class: "medium", lane_position: "curb", confidence: 0.9 };

    it("legacy G1 triage without a tag reads the model from the matching AiRun", async () => {
      const issue = await makeIssue(Category.POTHOLES, Status.OPEN);
      const report = await makeReport(issue.id, EvidenceRole.REPORT, `sha-g1-${issue.id}`, g1Triage);
      const run = await prisma.aiRun.create({
        data: {
          feature: "G1",
          model: "gemini:gemini-9-ultra",
          promptVer: "g1-v1",
          inputHash: computeInputHash("G1", "g1-v1", {
            reportId: report.id,
            category: "POTHOLES",
            photoSha256: report.photoSha256,
          }),
          output: g1Triage,
          valid: true,
        },
      });
      aiRunIds.push(run.id);

      const res = await assessIssueWithMeta(issue.id, { skipCache: true });
      expect(res.output.triage?.engine).toBe("Gemini (gemini-9-ultra)");
      expect(res.output.triage?.status).toBe("completed");
    });

    it("G1 triage with no tag and no AiRun shows 'Unknown engine'", async () => {
      const issue = await makeIssue(Category.POTHOLES, Status.OPEN);
      await makeReport(issue.id, EvidenceRole.REPORT, `sha-g1-none-${issue.id}`, g1Triage);

      const res = await assessIssueWithMeta(issue.id, { skipCache: true });
      expect(res.output.triage?.engine).toBe(UNKNOWN_ENGINE);
    });

    it("G2 fix-check run by the rules fallback is labelled as such", async () => {
      const issue = await makeIssue(Category.POTHOLES, Status.CLAIMED_FIXED);
      const original = await makeReport(issue.id, EvidenceRole.REPORT, `sha-orig-${issue.id}`, {
        ...g1Triage,
        _engine: "Groq qwen/qwen3-32b",
      });
      const fc = { same_location: "yes", defect_still_visible: "no", confidence: 0.8 };
      const claim = await makeReport(issue.id, EvidenceRole.CLAIM_FIX, `sha-claim-${issue.id}`, fc);
      const run = await prisma.aiRun.create({
        data: {
          feature: "G2",
          model: "rules-fallback",
          promptVer: "g2-v1",
          inputHash: computeInputHash("G2", "g2-v1", {
            claimReportId: claim.id,
            originalReportId: original.id,
            issueId: issue.id,
            category: "POTHOLES",
            claimPhotoSha256: claim.photoSha256,
            originalPhotoSha256: original.photoSha256,
          }),
          output: fc,
          valid: true,
        },
      });
      aiRunIds.push(run.id);

      const res = await assessIssueWithMeta(issue.id, { skipCache: true });
      expect(res.output.triage?.engine).toBe("Groq qwen/qwen3-32b");
      expect(res.output.fixCheck?.engine).toBe(RULES_ENGINE);
      expect(res.output.fixCheck?.status).toBe("unavailable");
    });

    it("processG1Triage tags the stored result with the real model, and the action log shows it", async () => {
      const issue = await makeIssue(Category.POTHOLES, Status.OPEN);
      const report = await makeReport(issue.id, EvidenceRole.REPORT, `sha-live-${issue.id}`);

      const fixture = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "tests/fixtures/llm/synthetic-gemini-g1-disagree.json"), "utf-8")
      );
      const rawText: string = fixture.candidates[0].content.parts[0].text;
      const adapter: LlmAdapter = {
        name: "gemini",
        isConfigured: () => true,
        generate: async (): Promise<LlmGenerateResult> => ({
          rawText,
          json: JSON.parse(rawText),
          provider: "gemini",
          model: "gemini-2.0-pro-exp",
        }),
      };

      await processG1Triage(report.id, { adapters: [adapter] });
      const stored = (await prisma.report.findUnique({ where: { id: report.id } }))!.aiTriage as Record<string, unknown>;
      expect(stored._engine).toBe("Gemini (gemini-2.0-pro-exp)");

      const res = await assessIssueWithMeta(issue.id, { skipCache: true });
      expect(res.output.triage?.engine).toBe("Gemini (gemini-2.0-pro-exp)");

      const logRes = await logGET(new Request(`http://localhost:3000/api/issues/${issue.id}/log`), {
        params: Promise.resolve({ id: issue.id }),
      });
      const { logs } = await logRes.json();
      const mismatch = logs.find((l: { action: string }) => l.action === "AI_FLAGGED_CATEGORY_MISMATCH");
      expect(mismatch).toBeDefined();
      expect(mismatch.engine).toBe("Gemini (gemini-2.0-pro-exp)");
    });
  });
});
