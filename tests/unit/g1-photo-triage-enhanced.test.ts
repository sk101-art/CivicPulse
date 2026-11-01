import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { Category, EvidenceRole, Status, Band } from "@prisma/client";
import { processG1Triage } from "@/lib/ai/triage";
import { assessIssueWithMeta } from "@/lib/ai/analyst";
import { LlmAdapter, LlmGenerateResult } from "@/lib/external/llm/types";
import { formatDateTimeIST } from "@/lib/time/ist";

describe("G1 Photo Triage enhancements: unknown mismatch, scene detection, warning chips, run time", () => {
  const createdIssueIds: string[] = [];
  const createdReportIds: string[] = [];
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Seed user required");
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

  it("when AI returns category 'unknown', flags as mismatch: sets needsDuplicateReview, creates AI_FLAGGED_CATEGORY_MISMATCH ActionLog, and adds warning chip", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9352,
        lng: 77.6945,
        address: "ORR Marathahalli Bridge",
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.LOW,
        needsDuplicateReview: false,
      },
    });
    createdIssueIds.push(issue.id);

    // Create report with creation time in the past
    const reportCreatedAt = new Date(Date.now() - 24 * 3600 * 1000); // 24 hours ago
    const report = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.REPORT,
        photoUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        photoSha256: `sha256-unknown-${Date.now()}`,
        signature: "sig-unknown",
        lat: 12.9352,
        lng: 77.6945,
        gpsAccuracyM: 3.5,
        capturedAt: reportCreatedAt,
        createdAt: reportCreatedAt,
      },
    });
    createdReportIds.push(report.id);

    // Mock adapter returning category: "unknown" and shows_reported_defect: "no"
    const mockUnknownAdapter: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const json = {
          category: "unknown",
          shows_reported_defect: "no",
          scene: "road",
          size_class: "unknown",
          lane_position: "unknown",
          water_present: "no",
          recapture_suspected: "no",
          faces_or_plates: "no",
          confidence: 0.85,
        };
        return {
          rawText: JSON.stringify(json),
          json,
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    const triage = await processG1Triage(report.id, { adapters: [mockUnknownAdapter] });
    expect(triage?.category).toBe("unknown");
    expect(triage?.shows_reported_defect).toBe("no");

    // 1. Issue must have needsDuplicateReview = true
    const updatedIssue = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(updatedIssue?.needsDuplicateReview).toBe(true);

    // 2. ActionLog must have AI_FLAGGED_CATEGORY_MISMATCH with note "Photo does not show a POTHOLES — desk review"
    const logs = await prisma.actionLog.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "desc" },
    });
    const mismatchLog = logs.find((l) => l.action === "AI_FLAGGED_CATEGORY_MISMATCH");
    expect(mismatchLog).toBeDefined();
    expect(mismatchLog?.note).toBe("Photo does not show a POTHOLES — desk review");

    // 3. Desk analyst G1 card meta must include warning chip "Photo doesn't show the reported issue"
    // and G1 run time must be the triage run time, not report creation time
    const assessed = await assessIssueWithMeta(issue.id, { skipCache: true });
    expect(assessed.output.triage).toBeDefined();
    expect(assessed.output.triage?.flags).toContain("Photo doesn't show the reported issue");

    // G1 run time should NOT equal the report creation time (which was 24h ago)
    const formattedReportTime = formatDateTimeIST(reportCreatedAt);
    const g1CardTime = assessed.output.triage?.time;
    expect(g1CardTime).not.toBe(formattedReportTime);
  });

  it("flags indoor scenes and screen scenes with appropriate ActionLog and flags", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        status: Status.OPEN,
        lat: 12.9352,
        lng: 77.6945,
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
        photoSha256: `sha256-indoor-${Date.now()}`,
        signature: "sig-indoor",
        lat: 12.9352,
        lng: 77.6945,
        gpsAccuracyM: 3.5,
        capturedAt: new Date(),
      },
    });
    createdReportIds.push(report.id);

    // Mock adapter returning scene: "indoor"
    const mockIndoorAdapter: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const json = {
          category: "unknown",
          shows_reported_defect: "no",
          scene: "indoor",
          size_class: "unknown",
          lane_position: "unknown",
          water_present: "no",
          recapture_suspected: "no",
          faces_or_plates: "no",
          confidence: 0.9,
        };
        return {
          rawText: JSON.stringify(json),
          json,
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    await processG1Triage(report.id, { adapters: [mockIndoorAdapter] });

    const updatedIssue = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(updatedIssue?.needsDuplicateReview).toBe(true);
    expect(updatedIssue?.hazardFlag).toContain("INDOOR_SCENE");

    const logs = await prisma.actionLog.findMany({ where: { issueId: issue.id } });
    const indoorLog = logs.find((l) => l.action === "AI_FLAGGED_INDOOR_SCENE");
    expect(indoorLog).toBeDefined();

    const assessed = await assessIssueWithMeta(issue.id, { skipCache: true });
    expect(assessed.output.triage?.flags).toContain("Indoor scene (not road/roadside)");
    expect(assessed.output.triage?.flags).toContain("Photo doesn't show the reported issue");
  });
});
