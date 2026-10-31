import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { assessIssueWithMeta } from "@/lib/ai/analyst";
import { GET as logGET } from "@/app/api/issues/[id]/log/route";
import { Status, Category, EvidenceRole } from "@prisma/client";

describe("AI Results & Flags Surfacing in Drawer and Action Log", () => {
  it("surfaces G1 photo triage flags (category mismatch, recapture, low confidence) in drawer data", async () => {
    const testIssue = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        status: Status.OPEN,
        lat: 12.925,
        lng: 77.675,
        address: "Outer Ring Road Test",
        priority: 50,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        reports: {
          create: {
            userId: "test-user-flags-1",
            role: EvidenceRole.REPORT,
            photoUrl: "https://example.com/photo.jpg",
            photoSha256: "hash123",
            signature: "sig123",
            lat: 12.925,
            lng: 77.675,
            gpsAccuracyM: 5,
            capturedAt: new Date(),
            aiTriage: {
              category: "POTHOLES", // Category mismatch!
              size_class: "large",
              lane_position: "wheel_path",
              water_present: "yes",
              recapture_suspected: "yes", // Recapture flag!
              confidence: 0.55, // Low confidence flag!
            },
          },
        },
      },
    });

    try {
      const result = await assessIssueWithMeta(testIssue.id, { skipCache: true });
      expect(result.output.triage).toBeDefined();

      const triage = result.output.triage!;
      expect(triage.flags).toBeDefined();
      expect(triage.flags.some((f) => f.includes("Category mismatch"))).toBe(true);
      expect(triage.flags.some((f) => f.includes("Recapture/screen photo"))).toBe(true);
      expect(triage.flags.some((f) => f.includes("Low confidence"))).toBe(true);
      expect(triage.engine).toBeDefined();
      expect(triage.time).toBeDefined();
    } finally {
      await prisma.report.deleteMany({ where: { issueId: testIssue.id } });
      await prisma.issue.delete({ where: { id: testIssue.id } }).catch(() => {});
    }
  });

  it("surfaces G2 fix-check flags (defect still visible, location mismatch) in drawer data", async () => {
    const testIssue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.CLAIMED_FIXED,
        lat: 12.930,
        lng: 77.680,
        address: "Bellandur Service Road",
        priority: 55,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        reports: {
          create: [
            {
              userId: "test-user-original",
              role: EvidenceRole.REPORT,
              photoUrl: "https://example.com/orig.jpg",
              photoSha256: "orig123",
              signature: "sig-orig",
              lat: 12.930,
              lng: 77.680,
              gpsAccuracyM: 5,
              capturedAt: new Date(),
            },
            {
              userId: "test-user-claim",
              role: EvidenceRole.CLAIM_FIX,
              photoUrl: "https://example.com/fix.jpg",
              photoSha256: "fix123",
              signature: "sig-fix",
              lat: 12.930,
              lng: 77.680,
              gpsAccuracyM: 6,
              capturedAt: new Date(),
              aiTriage: {
                same_location: "no", // Location mismatch flag!
                defect_still_visible: "yes", // Defect still visible flag!
                confidence: 0.65, // Low confidence flag!
              },
            },
          ],
        },
      },
    });

    try {
      const result = await assessIssueWithMeta(testIssue.id, { skipCache: true });
      expect(result.output.fixCheck).toBeDefined();

      const fixCheck = result.output.fixCheck!;
      expect(fixCheck.flags).toBeDefined();
      expect(fixCheck.flags.some((f) => f.includes("Defect still visible"))).toBe(true);
      expect(fixCheck.flags.some((f) => f.includes("Location mismatch"))).toBe(true);
      expect(fixCheck.flags.some((f) => f.includes("Low confidence"))).toBe(true);
      expect(fixCheck.engine).toBeDefined();
      expect(fixCheck.time).toBeDefined();
    } finally {
      await prisma.report.deleteMany({ where: { issueId: testIssue.id } });
      await prisma.issue.delete({ where: { id: testIssue.id } }).catch(() => {});
    }
  });

  it("surfaces AI action flags in the action log API route", async () => {
    const testIssue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.920,
        lng: 77.670,
        address: "Outer Ring Road Sector 1",
        priority: 45,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        actions: {
          create: [
            {
              actorId: "system",
              action: "AI_FLAGGED_CATEGORY_MISMATCH",
              note: 'AI photo triage suggested "DRAINAGE" (differs from reported "POTHOLES") with confidence 0.60 — flagged for desk review.',
            },
            {
              actorId: "system",
              action: "AI_RECAPTURE_FLAGGED",
              note: "AI detected suspected recapture/screen-photo — requirement set: needs one extra verifier.",
            },
          ],
        },
      },
    });

    const res = await logGET(
      new Request(`http://localhost:3000/api/issues/${testIssue.id}/log`),
      { params: Promise.resolve({ id: testIssue.id }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.logs).toBeDefined();
    expect(json.logs.length).toBeGreaterThanOrEqual(2);

    const mismatchLog = json.logs.find((l: any) => l.action === "AI_FLAGGED_CATEGORY_MISMATCH");
    expect(mismatchLog.flags).toContain("Category mismatch");
    expect(mismatchLog.isAiAction).toBe(true);

    const recaptureLog = json.logs.find((l: any) => l.action === "AI_RECAPTURE_FLAGGED");
    expect(recaptureLog.flags).toContain("Recapture/screen photo");
    expect(recaptureLog.isAiAction).toBe(true);
  });
});
