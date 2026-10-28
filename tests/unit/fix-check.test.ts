import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import { Category, EvidenceRole, Status, Band } from "@prisma/client";
import { processG2FixCheck, G2FixCheckResult } from "@/lib/ai/fixCheck";
import { LlmAdapter, LlmGenerateResult } from "@/lib/external/llm/types";

describe("T52 Acceptance Test: G2 Fix-Check Comparator", () => {
  const createdIssueIds: string[] = [];
  const createdReportIds: string[] = [];
  let testUserId: string;

  const normalFixture = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/llm/synthetic-groq-g2.json"),
      "utf-8"
    )
  );

  const flaggedFixture = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/llm/synthetic-groq-g2-flagged.json"),
      "utf-8"
    )
  );

  beforeAll(async () => {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Seed user required for T52 test");
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

  it("processes clean fix-check where defect is fixed: stores aiTriage and preserves CLAIMED_FIXED status", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.CLAIMED_FIXED,
        lat: 12.9365,
        lng: 77.6955,
        address: "ORR Outer Ring Road Kadubeesanahalli",
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.MEDIUM,
      },
    });
    createdIssueIds.push(issue.id);

    const originalReport = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.REPORT,
        photoUrl: "data:image/jpeg;base64,/9j/original",
        photoSha256: "sha256-orig",
        signature: "sig-orig",
        lat: 12.9365,
        lng: 77.6955,
        gpsAccuracyM: 3.0,
        capturedAt: new Date(Date.now() - 3600 * 1000),
      },
    });
    createdReportIds.push(originalReport.id);

    const claimReport = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.CLAIM_FIX,
        photoUrl: "data:image/jpeg;base64,/9j/claimed",
        photoSha256: "sha256-claim",
        signature: "sig-claim",
        lat: 12.9365,
        lng: 77.6955,
        gpsAccuracyM: 2.5,
        capturedAt: new Date(),
      },
    });
    createdReportIds.push(claimReport.id);

    const mockGroq: LlmAdapter = {
      name: "groq",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const rawText = normalFixture.choices[0].message.content;
        return {
          rawText,
          json: JSON.parse(rawText),
          provider: "groq",
          model: "qwen/qwen3.8-27b",
        };
      },
    };

    const result = await processG2FixCheck(claimReport.id, { adapters: [mockGroq] });

    expect(result).not.toBeNull();
    expect(result?.same_location).toBe("yes");
    expect(result?.defect_still_visible).toBe("no");
    expect(result?.confidence).toBe(0.91);

    // Verify claimReport.aiTriage updated
    const updatedClaimReport = await prisma.report.findUnique({
      where: { id: claimReport.id },
    });
    expect(updatedClaimReport?.aiTriage).not.toBeNull();
    const stored = updatedClaimReport?.aiTriage as unknown as G2FixCheckResult;
    expect(stored.defect_still_visible).toBe("no");

    // Status remains strictly CLAIMED_FIXED
    const updatedIssue = await prisma.issue.findUnique({
      where: { id: issue.id },
    });
    expect(updatedIssue?.status).toBe(Status.CLAIMED_FIXED);
    expect(updatedIssue?.hazardFlag || "").not.toContain("AI_FLAGGED_FIX_CHECK");
  });

  it("flags issue when defect is still visible: adds 'Needs citizen check — AI flagged' badge without altering status", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.CLAIMED_FIXED,
        lat: 12.9370,
        lng: 77.6960,
        address: "ORR Marathahalli flyover",
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.HIGH,
      },
    });
    createdIssueIds.push(issue.id);

    const originalReport = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.REPORT,
        photoUrl: "data:image/jpeg;base64,/9j/orig2",
        photoSha256: "sha256-orig2",
        signature: "sig-orig2",
        lat: 12.9370,
        lng: 77.6960,
        gpsAccuracyM: 3.0,
        capturedAt: new Date(Date.now() - 3600 * 1000),
      },
    });
    createdReportIds.push(originalReport.id);

    const claimReport = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.CLAIM_FIX,
        photoUrl: "data:image/jpeg;base64,/9j/claim2",
        photoSha256: "sha256-claim2",
        signature: "sig-claim2",
        lat: 12.9370,
        lng: 77.6960,
        gpsAccuracyM: 2.5,
        capturedAt: new Date(),
      },
    });
    createdReportIds.push(claimReport.id);

    // Mock flagged fixture (defect_still_visible = yes, confidence = 0.88)
    const mockGroqFlagged: LlmAdapter = {
      name: "groq",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const rawText = flaggedFixture.choices[0].message.content;
        return {
          rawText,
          json: JSON.parse(rawText),
          provider: "groq",
          model: "qwen/qwen3.8-27b",
        };
      },
    };

    const result = await processG2FixCheck(claimReport.id, { adapters: [mockGroqFlagged] });

    expect(result?.defect_still_visible).toBe("yes");
    expect(result?.confidence).toBe(0.88);

    const updatedIssue = await prisma.issue.findUnique({
      where: { id: issue.id },
    });

    // Badge added on hazardFlag
    expect(updatedIssue?.hazardFlag).toContain("AI_FLAGGED_FIX_CHECK");

    // ActionLog audit row recorded
    const logs = await prisma.actionLog.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "desc" },
    });
    const fixCheckLog = logs.find((l) => l.action === "AI_FIX_CHECK_FLAGGED");
    expect(fixCheckLog).toBeDefined();
    expect(fixCheckLog?.note).toContain("Needs citizen check — AI flagged");

    // HARD ACCEPTANCE CHECK: Must NEVER call state machine or change status
    expect(updatedIssue?.status).toBe(Status.CLAIMED_FIXED);
  });

  it("CRITICAL RULE: Cannot call state machine or trigger status transitions even under high AI disagreement", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        status: Status.CLAIMED_FIXED,
        lat: 12.9375,
        lng: 77.6965,
        address: "Bellandur Outer Ring Road",
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.CRITICAL,
      },
    });
    createdIssueIds.push(issue.id);

    const claimReport = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.CLAIM_FIX,
        photoUrl: "data:image/jpeg;base64,/9j/claim3",
        photoSha256: "sha256-claim3",
        signature: "sig-claim3",
        lat: 12.9375,
        lng: 77.6965,
        gpsAccuracyM: 2.0,
        capturedAt: new Date(),
      },
    });
    createdReportIds.push(claimReport.id);

    // Extreme disagree: wrong location (same_location = no) and defect still visible with 0.99 confidence
    const mockExtreme: LlmAdapter = {
      name: "groq",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        return {
          rawText: '{"same_location":"no","defect_still_visible":"yes","confidence":0.99}',
          json: { same_location: "no", defect_still_visible: "yes", confidence: 0.99 },
          provider: "groq",
          model: "qwen/qwen3.8-27b",
        };
      },
    };

    await processG2FixCheck(claimReport.id, { adapters: [mockExtreme] });

    const updatedIssue = await prisma.issue.findUnique({
      where: { id: issue.id },
    });

    // Under NO circumstances can status transition to DISPUTED or REJECTED from AI comparator alone
    expect(updatedIssue?.status).toBe(Status.CLAIMED_FIXED);
    expect(updatedIssue?.status).not.toBe(Status.DISPUTED);
    expect(updatedIssue?.status).not.toBe(Status.REJECTED);
  });
});
