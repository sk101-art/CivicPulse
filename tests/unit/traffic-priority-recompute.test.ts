import { describe, it, expect, vi, beforeEach } from "vitest";
import { recomputeIssuePriority } from "@/lib/jobs/priorityRecompute";
import { prisma } from "@/lib/db/prisma";
import { Category, Status } from "@prisma/client";

interface UpdatedIssueData {
  priority: number;
  piBreakdown: {
    congestionR: number | null;
    traffic: "live" | "estimated";
  };
  piText: string;
}

describe("Priority Recomputation with Real Traffic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes median congestionR and maps FRC when roadClass is empty, recording 'traffic: live'", async () => {
    const mockIssue = {
      id: "issue-traffic-test",
      category: Category.POTHOLES,
      status: Status.OPEN,
      lat: 12.9558,
      lng: 77.7012,
      createdAt: new Date(Date.now() - 24 * 3600 * 1000), // 24 hours old
      sizeClass: "medium",
      lanePosition: null,
      blockedShare: "none",
      wardId: "ward-1",
      recurrenceOf: null,
      agency: { slaHours: 72 },
      segment: {
        roadClass: null, // empty road class to trigger FRC mapping
        lanes: 2,
        busesPerHour: 5,
        nearSchoolOrHospital: false,
        soleAccess: false,
      },
      reports: [
        { userId: "user-1", role: "REPORT", offline: false },
      ],
    };

    vi.spyOn(prisma.issue, "findUnique").mockResolvedValue(mockIssue as never);
    vi.spyOn(prisma.weatherForecast, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);

    // Provide 3 samples within 14 days
    const mockSamples = [
      { congestionR: 0.2, frc: "FRC1" },
      { congestionR: 0.6, frc: "FRC1" },
      { congestionR: 0.4, frc: "FRC1" },
    ];
    vi.spyOn(prisma.trafficSample, "findMany").mockResolvedValue(mockSamples as never);

    let updatedData: UpdatedIssueData | null = null;
    vi.spyOn(prisma.issue, "update").mockImplementation((args) => {
      if ((args.data as Record<string, unknown>)?.piBreakdown) {
        updatedData = args.data as unknown as UpdatedIssueData;
      }
      return Promise.resolve({ id: mockIssue.id, priority: (args.data as { priority?: number }).priority ?? 0 }) as unknown as ReturnType<typeof prisma.issue.update>;
    });

    const pi = await recomputeIssuePriority(mockIssue.id);

    expect(pi).toBeGreaterThan(0);
    expect(updatedData).not.toBeNull();
    // Median of [0.2, 0.4, 0.6] is 0.4
    expect(updatedData!.piBreakdown.congestionR).toBe(0.4);
    expect(updatedData!.piBreakdown.traffic).toBe("live");
    // FRC1 maps to primary road class
    expect(updatedData!.piText).toMatch(/primary/);
    expect(updatedData!.piText).toMatch(/traffic: live/);
  });

  it("falls back to default congestion when no traffic samples exist in last 14 days, recording 'traffic: estimated'", async () => {
    const mockIssue = {
      id: "issue-no-traffic",
      category: Category.POTHOLES,
      status: Status.OPEN,
      lat: 12.9558,
      lng: 77.7012,
      createdAt: new Date(Date.now() - 24 * 3600 * 1000),
      sizeClass: "medium",
      lanePosition: null,
      blockedShare: "none",
      wardId: "ward-1",
      recurrenceOf: null,
      agency: { slaHours: 72 },
      segment: {
        roadClass: "secondary",
        lanes: 2,
        busesPerHour: 0,
        nearSchoolOrHospital: false,
        soleAccess: false,
      },
      reports: [
        { userId: "user-1", role: "REPORT", offline: false },
      ],
    };

    vi.spyOn(prisma.issue, "findUnique").mockResolvedValue(mockIssue as never);
    vi.spyOn(prisma.weatherForecast, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
    vi.spyOn(prisma.trafficSample, "findMany").mockResolvedValue([]);

    let updatedData: UpdatedIssueData | null = null;
    vi.spyOn(prisma.issue, "update").mockImplementation((args) => {
      if ((args.data as Record<string, unknown>)?.piBreakdown) {
        updatedData = args.data as unknown as UpdatedIssueData;
      }
      return Promise.resolve({ id: mockIssue.id, priority: (args.data as { priority?: number }).priority ?? 0 }) as unknown as ReturnType<typeof prisma.issue.update>;
    });

    const pi = await recomputeIssuePriority(mockIssue.id);

    expect(pi).toBeGreaterThan(0);
    expect(updatedData).not.toBeNull();
    expect(updatedData!.piBreakdown.congestionR).toBeNull();
    expect(updatedData!.piBreakdown.traffic).toBe("estimated");
    expect(updatedData!.piText).toMatch(/traffic: estimated/);
  });
});
