import { describe, it, expect, vi, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { processG1Job } from "@/lib/ai/triage";
import { processG2Job } from "@/lib/ai/fixCheck";
import { sanitizeErrorMessage } from "@/lib/api/errors";
import { Category, EvidenceRole } from "@prisma/client";

describe("AI Queue deleted target and error handling", () => {
  const createdJobIds: string[] = [];
  const createdReportIds: string[] = [];
  const createdIssueIds: string[] = [];

  afterAll(async () => {
    for (const id of createdJobIds) {
      await prisma.aiJob.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdReportIds) {
      await prisma.report.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdIssueIds) {
      await prisma.actionLog.deleteMany({ where: { issueId: id } }).catch(() => {});
      await prisma.issue.delete({ where: { id } }).catch(() => {});
    }
  });

  it("G1 job with deleted/non-existent target is marked failed with attempts=3 and skipped without error", async () => {
    const job = await prisma.aiJob.create({
      data: {
        feature: "G1",
        targetId: `deleted-report-${Date.now()}`,
        status: "queued",
        attempts: 0,
      },
    });
    createdJobIds.push(job.id);

    const result = await processG1Job(job.id);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe("target_deleted");

    const updated = await prisma.aiJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe("failed");
    expect(updated?.attempts).toBe(3);
  });

  it("G2 job with deleted/non-existent target is marked failed with attempts=3 and skipped without error", async () => {
    const job = await prisma.aiJob.create({
      data: {
        feature: "G2",
        targetId: `deleted-claim-${Date.now()}`,
        status: "queued",
        attempts: 0,
      },
    });
    createdJobIds.push(job.id);

    const result = await processG2Job(job.id);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe("target_deleted");

    const updated = await prisma.aiJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe("failed");
    expect(updated?.attempts).toBe(3);
  });

  it("processG1Job logs error to console and returns ok:false with error message when processing throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Create a real issue + report so triage runs, but pass a throwing adapter
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("Seed user required");

    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        lat: 12.9716,
        lng: 77.5946,
        slaDueAt: new Date(Date.now() + 86400000),
      },
    });
    createdIssueIds.push(issue.id);

    const report = await prisma.report.create({
      data: {
        issueId: issue.id,
        userId: user.id,
        role: EvidenceRole.REPORT,
        photoUrl: "data:image/jpeg;base64,fakephotodata",
        photoSha256: "fakehash",
        signature: "fakesig",
        lat: 12.9716,
        lng: 77.5946,
        gpsAccuracyM: 5.0,
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

    const updateSpy = vi.spyOn(prisma.report, "update").mockRejectedValueOnce(
      new Error(
        "Database error updating report: postgresql://postgres:super_secret_password123@db.supabase.co:5432/postgres"
      )
    );

    const result = await processG1Job(job.id);

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[ai-queue] job failed",
      job.id,
      expect.any(Error)
    );

    // Verify sanitization strips secrets
    const sanitized = sanitizeErrorMessage(result.error!);
    expect(sanitized).not.toContain("super_secret_password123");
    expect(sanitized).toContain("[REDACTED]");

    const updated = await prisma.aiJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe("failed");

    updateSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
