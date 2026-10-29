import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTrafficSample, DAILY_TOMTOM_BUDGET } from "@/lib/jobs/trafficSample";
import { prisma } from "@/lib/db/prisma";
import * as tomtom from "@/lib/external/tomtom";
import { Status } from "@prisma/client";

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isConfigured: (key: string) => (key === "TOMTOM_API_KEY" ? true : actual.isConfigured(key as never)),
  };
});

describe("Traffic Sample Job & Budget Limiting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the daily budget cap of 1500 calls", () => {
    expect(DAILY_TOMTOM_BUDGET).toBe(1500);
  });

  it("skips execution when daily budget of 1500 calls has already been reached", async () => {
    // Mock prisma.trafficSample.count to return 1500
    vi.spyOn(prisma.trafficSample, "count").mockResolvedValue(1500);
    const flowSpy = vi.spyOn(tomtom, "getFlowSegment");

    const result = await runTrafficSample(Date.now());

    expect(result.processed).toBe(0);
    expect(result.skipped).toMatch(/Daily TomTom budget reached \(1500\/1500\)/);
    expect(flowSpy).not.toHaveBeenCalled();
  });

  it("samples eligible open and claimed/assigned issues, skipping recently sampled ones", async () => {
    // 100 calls made today -> 1400 left
    vi.spyOn(prisma.trafficSample, "count").mockResolvedValue(100);

    const mockOpenIssues = [
      { id: "issue-open-1", lat: 12.9558, lng: 77.7012, segmentId: "seg-1", priority: 85, status: Status.OPEN },
      { id: "issue-open-2", lat: 12.9560, lng: 77.7015, segmentId: null, priority: 75, status: Status.OPEN },
    ];
    const mockActiveIssues = [
      { id: "issue-assigned-3", lat: 12.9570, lng: 77.7020, segmentId: "seg-2", priority: 50, status: Status.ASSIGNED },
    ];

    vi.spyOn(prisma.issue, "findMany").mockImplementation((args) => {
      const where = args?.where as { status?: unknown } | undefined;
      if (where?.status === Status.OPEN) {
        return Promise.resolve(mockOpenIssues) as unknown as ReturnType<typeof prisma.issue.findMany>;
      }
      return Promise.resolve(mockActiveIssues) as unknown as ReturnType<typeof prisma.issue.findMany>;
    });

    // Suppose issue-open-2 was already sampled for this hourOfWeek in last 7 days
    vi.spyOn(prisma.trafficSample, "findMany").mockResolvedValue([
      { issueId: "issue-open-2" } as never,
    ]);

    const flowSpy = vi.spyOn(tomtom, "getFlowSegment").mockResolvedValue({
      currentSpeed: 30,
      freeFlowSpeed: 50,
      confidence: 0.9,
      frc: "FRC1",
    });

    const createSpy = vi.spyOn(prisma.trafficSample, "create").mockResolvedValue({} as never);

    const result = await runTrafficSample(Date.now());

    // Should sample issue-open-1 and issue-assigned-3 (skipping issue-open-2)
    expect(result.processed).toBe(2);
    expect(flowSpy).toHaveBeenCalledTimes(2);
    expect(createSpy).toHaveBeenCalledTimes(2);
    // Verified congestion calculation: 1 - 30/50 = 0.4
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issueId: "issue-open-1",
          currentSpeed: 30,
          freeFlowSpeed: 50,
          congestionR: 0.4,
          frc: "FRC1",
        }),
      })
    );
  });
});
