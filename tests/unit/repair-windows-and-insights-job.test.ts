import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { runDailyInsightsJob } from "@/lib/insights/deterioration";
import {
  runRepairWindowsJob,
  computeRepairWindowInputHash,
} from "@/lib/jobs/repairWindows";
import { Category, Status } from "@prisma/client";

describe("Insights & Repair-Windows Job Enhancements", () => {
  describe("computeRepairWindowInputHash", () => {
    it("generates deterministic hash based on inputs", () => {
      const hash1 = computeRepairWindowInputHash({
        category: "POTHOLES",
        lanePosition: "CURB",
        deteriorationRisk: "HIGH",
        deteriorationScore: 80,
        priority: 75.5,
        profileFetchedAt: new Date("2026-10-30T10:00:00Z"),
        weatherDate: new Date("2026-10-31T00:00:00Z"),
      });

      const hash2 = computeRepairWindowInputHash({
        category: "POTHOLES",
        lanePosition: "CURB",
        deteriorationRisk: "HIGH",
        deteriorationScore: 80,
        priority: 75.5,
        profileFetchedAt: new Date("2026-10-30T10:00:00Z"),
        weatherDate: new Date("2026-10-31T00:00:00Z"),
      });

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(16);
    });

    it("changes hash when inputs change", () => {
      const base = {
        category: "POTHOLES",
        lanePosition: "CURB",
        deteriorationRisk: "HIGH",
        deteriorationScore: 80,
        priority: 75.5,
        profileFetchedAt: new Date("2026-10-30T10:00:00Z"),
        weatherDate: new Date("2026-10-31T00:00:00Z"),
      };

      const hashBase = computeRepairWindowInputHash(base);
      const hashNewLane = computeRepairWindowInputHash({ ...base, lanePosition: "SHOULDER" });
      const hashNewCategory = computeRepairWindowInputHash({ ...base, category: "STREETLIGHTS" });
      const hashNewRisk = computeRepairWindowInputHash({ ...base, deteriorationRisk: "LOW" });
      const hashNewProfile = computeRepairWindowInputHash({
        ...base,
        profileFetchedAt: new Date("2026-10-31T12:00:00Z"),
      });

      expect(hashNewLane).not.toBe(hashBase);
      expect(hashNewCategory).not.toBe(hashBase);
      expect(hashNewRisk).not.toBe(hashBase);
      expect(hashNewProfile).not.toBe(hashBase);
    });
  });

  describe("runDailyInsightsJob batching & time budget", () => {
    it("respects the time budget guard and stops starting new issues when < 15s remains", async () => {
      // Fake startedAt so that elapsed time is already 26s (> 25s of 40s budget, i.e. < 14s remaining)
      const simulatedStartedAt = Date.now() - 26_000;
      const tracker = { processed: 0, remaining: 0 };

      const result = await runDailyInsightsJob(simulatedStartedAt, 40_000, tracker);
      expect(result.assessedIssuesCount).toBe(0);
      expect(tracker.processed).toBe(0);
    });
  });

  describe("runRepairWindowsJob batching & input hash filtering", () => {
    it("respects the time budget guard and stops starting new issues when < 15s remains", async () => {
      // Fake startedAt so that elapsed time is already 26s (> 25s of 40s budget)
      const simulatedStartedAt = Date.now() - 26_000;
      const tracker = { processed: 0, remaining: 0 };

      const result = await runRepairWindowsJob(simulatedStartedAt, 40_000, tracker);
      expect(result.processed).toBe(0);
    });
  });
});
