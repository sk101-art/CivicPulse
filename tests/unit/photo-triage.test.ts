import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import { Category, EvidenceRole, Status, Band } from "@prisma/client";
import { processG1Triage, G1TriageResult } from "@/lib/ai/triage";
import { LlmAdapter, LlmGenerateResult } from "@/lib/external/llm/types";

describe("T51 Acceptance Test: G1 Photo Triage", () => {
  const createdIssueIds: string[] = [];
  const createdReportIds: string[] = [];
  let testUserId: string;

  const normalFixture = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/llm/synthetic-gemini-g1.json"),
      "utf-8"
    )
  );

  const disagreeFixture = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/llm/synthetic-gemini-g1-disagree.json"),
      "utf-8"
    )
  );

  beforeAll(async () => {
    const user = await prisma.user.findFirst();
    if (!user) {
      throw new Error("Seed user required for T51 test");
    }
    testUserId = user.id;
  });

  afterAll(async () => {
    for (const rId of createdReportIds) {
      await prisma.report.delete({ where: { id: rId } }).catch(() => {});
    }
    for (const iId of createdIssueIds) {
      await prisma.actionLog.deleteMany({ where: { issueId: iId } }).catch(() => {});
      await prisma.report.deleteMany({ where: { issueId: iId } }).catch(() => {});
      await prisma.issue.delete({ where: { id: iId } }).catch(() => {});
    }
  });

  it("processes G1 triage, populates Report.aiTriage, and feeds size_class to empty Issue", async () => {
    // 1. Create test issue without sizeClass
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9352,
        lng: 77.6945,
        address: "ORR Marathahalli Bridge",
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.LOW,
        priority: 15.0,
      },
    });
    createdIssueIds.push(issue.id);

    const report = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.REPORT,
        photoUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        photoSha256: "sha256-dummy-1",
        signature: "sig-dummy-1",
        lat: 12.9352,
        lng: 77.6945,
        gpsAccuracyM: 3.5,
        capturedAt: new Date(),
      },
    });
    createdReportIds.push(report.id);

    // Mock adapter using synthetic fixture
    const mockGemini: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const rawText = normalFixture.candidates[0].content.parts[0].text;
        return {
          rawText,
          json: JSON.parse(rawText),
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    const triage = await processG1Triage(report.id, { adapters: [mockGemini] });

    expect(triage).not.toBeNull();
    expect(triage?.category).toBe("POTHOLES");
    expect(triage?.size_class).toBe("large");
    expect(triage?.confidence).toBe(0.94);

    // Verify report was updated with aiTriage
    const updatedReport = await prisma.report.findUnique({
      where: { id: report.id },
    });
    expect(updatedReport?.aiTriage).not.toBeNull();
    const storedTriage = updatedReport?.aiTriage as unknown as G1TriageResult;
    expect(storedTriage.size_class).toBe("large");

    // Verify sizeClass and lanePosition were fed into the empty issue
    const updatedIssue = await prisma.issue.findUnique({
      where: { id: issue.id },
    });
    expect(updatedIssue?.sizeClass).toBe("large");
    expect(updatedIssue?.lanePosition).toBe("wheel_path");
    // Reporter's category unchanged
    expect(updatedIssue?.category).toBe(Category.POTHOLES);
  });

  it("flags for desk review on category disagreement without changing the reporter's category", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9355,
        lng: 77.6948,
        address: "Kadubeesanahalli Junction",
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.LOW,
        needsDuplicateReview: false,
      },
    });
    createdIssueIds.push(issue.id);

    const report = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.REPORT,
        photoUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        photoSha256: "sha256-dummy-disagree",
        signature: "sig-dummy-disagree",
        lat: 12.9355,
        lng: 77.6948,
        gpsAccuracyM: 4.0,
        capturedAt: new Date(),
      },
    });
    createdReportIds.push(report.id);

    // Mock adapter using disagreement fixture (suggests DRAINAGE, recapture_suspected: yes)
    const mockGeminiDisagree: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const rawText = disagreeFixture.candidates[0].content.parts[0].text;
        return {
          rawText,
          json: JSON.parse(rawText),
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    const triage = await processG1Triage(report.id, { adapters: [mockGeminiDisagree] });

    expect(triage?.category).toBe("DRAINAGE");
    expect(triage?.recapture_suspected).toBe("yes");

    const updatedIssue = await prisma.issue.findUnique({
      where: { id: issue.id },
    });

    // HARD RULE: Category must NEVER be auto-changed
    expect(updatedIssue?.category).toBe(Category.POTHOLES);
    // Flagged for desk review
    expect(updatedIssue?.needsDuplicateReview).toBe(true);
    // Recapture suspected sets "needs one extra verifier"
    expect(updatedIssue?.hazardFlag).toContain("NEEDS_EXTRA_VERIFIER");

    // ActionLog audit trails
    const logs = await prisma.actionLog.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "desc" },
    });
    const mismatchLog = logs.find((l) => l.action === "AI_FLAGGED_CATEGORY_MISMATCH");
    expect(mismatchLog).toBeDefined();
    expect(mismatchLog?.note).toContain("DRAINAGE");

    const recaptureLog = logs.find((l) => l.action === "AI_RECAPTURE_FLAGGED");
    expect(recaptureLog).toBeDefined();
    expect(recaptureLog?.note).toContain("needs one extra verifier");
  });

  it("does NOT overwrite sizeClass if reporter already specified it", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9360,
        lng: 77.6950,
        address: "Devarabeesanahalli",
        sizeClass: "small", // Reporter explicitly provided "small"
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.LOW,
      },
    });
    createdIssueIds.push(issue.id);

    const report = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.REPORT,
        photoUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        photoSha256: "sha256-dummy-keep-size",
        signature: "sig-dummy-keep-size",
        lat: 12.9360,
        lng: 77.6950,
        gpsAccuracyM: 2.0,
        capturedAt: new Date(),
      },
    });
    createdReportIds.push(report.id);

    // AI returns large
    const mockGemini: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const rawText = normalFixture.candidates[0].content.parts[0].text; // size_class = large
        return {
          rawText,
          json: JSON.parse(rawText),
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    await processG1Triage(report.id, { adapters: [mockGemini] });

    const updatedIssue = await prisma.issue.findUnique({
      where: { id: issue.id },
    });

    // Reporter's explicit sizeClass preserved
    expect(updatedIssue?.sizeClass).toBe("small");
  });
});
