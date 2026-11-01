import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { processG1Job } from "@/lib/ai/triage";
import { runJob } from "@/lib/jobs/runner";
import { Category, EvidenceRole, Status, Band } from "@prisma/client";
import { LlmAdapter, LlmGenerateResult } from "@/lib/external/llm/types";

describe("G1 AI Queue processing and orphan skipping", () => {
  const createdJobIds: string[] = [];
  const createdReportIds: string[] = [];
  const createdIssueIds: string[] = [];
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.findFirst();
    if (!user) {
      throw new Error("Seed user required for test");
    }
    testUserId = user.id;
  });

  afterAll(async () => {
    for (const id of createdJobIds) {
      await prisma.aiJob.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdReportIds) {
      await prisma.report.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdIssueIds) {
      await prisma.actionLog.deleteMany({ where: { issueId: id } }).catch(() => {});
      await prisma.report.deleteMany({ where: { issueId: id } }).catch(() => {});
      await prisma.issue.delete({ where: { id } }).catch(() => {});
    }
  });

  it("marks orphan G1 job as status='skipped' with attempts=3", async () => {
    const orphanJob = await prisma.aiJob.create({
      data: {
        feature: "G1",
        targetId: `orphan-report-${Date.now()}`,
        status: "queued",
        attempts: 0,
      },
    });
    createdJobIds.push(orphanJob.id);

    const outcome = await processG1Job(orphanJob.id);
    expect(outcome.ok).toBe(true);
    expect(outcome.skipped).toBe("target_deleted");

    const updated = await prisma.aiJob.findUnique({ where: { id: orphanJob.id } });
    expect(updated?.status).toBe("skipped");
    expect(updated?.attempts).toBe(3);
  });

  it("processes queued G1 job for an existing report with real AI, marks completed and populates aiTriage", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9352,
        lng: 77.6945,
        address: "Test Corridor Road",
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.LOW,
        priority: 10.0,
      },
    });
    createdIssueIds.push(issue.id);

    const report = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.REPORT,
        photoUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        photoSha256: `sha256-g1-test-${Date.now()}`,
        signature: "sig-test-g1",
        lat: 12.9352,
        lng: 77.6945,
        gpsAccuracyM: 3.5,
        capturedAt: new Date(),
      },
    });
    createdReportIds.push(report.id);

    const job = await prisma.aiJob.create({
      data: {
        feature: "G1",
        targetId: report.id,
        status: "queued",
        attempts: 0,
      },
    });
    createdJobIds.push(job.id);

    const mockAdapter: LlmAdapter = {
      name: "gemini",
      isConfigured: () => true,
      generate: async (): Promise<LlmGenerateResult> => {
        const json = {
          category: "POTHOLES",
          shows_reported_defect: "yes",
          scene: "road",
          size_class: "medium",
          lane_position: "edge",
          water_present: "no",
          recapture_suspected: "no",
          faces_or_plates: "no",
          confidence: 0.95,
        };
        return {
          rawText: JSON.stringify(json),
          json,
          provider: "gemini",
          model: "gemini-2.5-flash",
        };
      },
    };

    const outcome = await processG1Job(job.id, { adapters: [mockAdapter] });
    expect(outcome.ok).toBe(true);

    const updatedJob = await prisma.aiJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("completed");

    const updatedReport = await prisma.report.findUnique({ where: { id: report.id } });
    expect(updatedReport?.aiTriage).not.toBeNull();
  });

  it("leaves AiJob retryable (status='queued', attempts incremented) when rules fallback runs", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9352,
        lng: 77.6945,
        address: "Fallback Test Road",
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        band: Band.LOW,
        priority: 10.0,
      },
    });
    createdIssueIds.push(issue.id);

    const report = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: testUserId,
        role: EvidenceRole.REPORT,
        photoUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        photoSha256: `sha256-fallback-${Date.now()}`,
        signature: "sig-fallback",
        lat: 12.9352,
        lng: 77.6945,
        gpsAccuracyM: 3.5,
        capturedAt: new Date(),
      },
    });
    createdReportIds.push(report.id);

    const job = await prisma.aiJob.create({
      data: {
        feature: "G1",
        targetId: report.id,
        status: "queued",
        attempts: 0,
      },
    });
    createdJobIds.push(job.id);

    // Provide empty adapters so it forces rules fallback
    const outcome = await processG1Job(job.id, { adapters: [] });
    expect(outcome.ok).toBe(true);
    expect(outcome.skipped).toBe("fallback_left_queued");

    const updatedJob = await prisma.aiJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("queued");
    expect(updatedJob?.attempts).toBe(1);
  });

  it("runJob('ai-queue') returns queued and picked counts in its result", async () => {
    const res = await runJob("ai-queue");
    expect(res.job).toBe("ai-queue");
    expect(typeof res.processed).toBe("number");
    expect(typeof res.queued).toBe("number");
    expect(typeof res.picked).toBe("number");
    expect(res.queued).toBeGreaterThanOrEqual(0);
    expect(res.picked).toBeGreaterThanOrEqual(0);
  });
});
