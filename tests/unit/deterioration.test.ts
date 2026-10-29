import { describe, it, expect } from "vitest";
import {
  computeDeterioration,
} from "@/lib/insights/deterioration";
import { Category, DeteriorationRisk } from "@prisma/client";

describe("Phase 3: Pavement Deterioration Intelligence & Hotspot Detection", () => {
  describe("computeDeterioration (pure logic)", () => {
    it("handles DEBRIS category: does not deteriorate, returns score 5, risk LOW, expectedDays null", () => {
      const result = computeDeterioration({
        category: "DEBRIS" as any,
        sizeClass: "LARGE",
        busesPerHour: 50,
        past7DaysRainMm: 60,
      });

      expect(result.risk).toBe(DeteriorationRisk.LOW);
      expect(result.score).toBe(5);
      expect(result.expectedDaysToWorsen).toBeNull();
      expect(result.explanation).toMatch(/Debris does not deteriorate/);
    });

    it("evaluates POTHOLES with large size and heavy rain as HIGH deterioration risk", () => {
      const result = computeDeterioration({
        category: Category.POTHOLES,
        sizeClass: "LARGE",
        busesPerHour: 45,
        delayRatio: 0.65,
        past7DaysRainMm: 38,
        forecast72hRainMm: 12,
        recurrenceCount12m: 2,
      });

      expect(result.risk).toBe(DeteriorationRisk.HIGH);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.expectedDaysToWorsen).toBeLessThanOrEqual(5);

      // Verify key named drivers are present in the output
      const driverNames = result.drivers.map((d) => d.name);
      expect(driverNames.some((n) => n.includes("Heavy rain"))).toBe(true);
      expect(driverNames.some((n) => n.includes("High bus frequency"))).toBe(true);
      expect(driverNames.some((n) => n.includes("Stop-and-go braking"))).toBe(true);
      expect(driverNames.some((n) => n.includes("Repeat failure"))).toBe(true);
    });

    it("evaluates a small defect under dry, low-traffic conditions as LOW risk", () => {
      const result = computeDeterioration({
        category: Category.POTHOLES,
        sizeClass: "SMALL",
        busesPerHour: 2,
        delayRatio: 0.05,
        past7DaysRainMm: 0,
        forecast72hRainMm: 0,
        recurrenceCount12m: 0,
      });

      expect(result.risk).toBe(DeteriorationRisk.LOW);
      expect(result.score).toBeLessThan(50);
      expect(result.expectedDaysToWorsen).toBe(21);
    });

    it("identifies repeat failure history as a major driver for weak subgrade", () => {
      const normalResult = computeDeterioration({
        category: Category.POTHOLES,
        sizeClass: "MEDIUM",
        busesPerHour: 5,
        recurrenceCount12m: 0,
      });

      const repeatResult = computeDeterioration({
        category: Category.POTHOLES,
        sizeClass: "MEDIUM",
        busesPerHour: 5,
        recurrenceCount12m: 3,
      });

      expect(repeatResult.score).toBeGreaterThan(normalResult.score);
      const repeatDriver = repeatResult.drivers.find((d) => d.factor === "repeat_failure");
      expect(repeatDriver).toBeDefined();
      expect(repeatDriver?.name).toMatch(/Repeat failure: 3 issues in 12 months/);
    });

    it("scales damage linearly with bus volume (heavy vehicle dynamic fatigue)", () => {
      const lowBus = computeDeterioration({
        category: Category.POTHOLES,
        busesPerHour: 0,
      });

      const highBus = computeDeterioration({
        category: Category.POTHOLES,
        busesPerHour: 45,
      });

      expect(highBus.score).toBeGreaterThan(lowBus.score);
      expect(highBus.drivers.some((d) => d.factor === "heavy_traffic")).toBe(true);
    });
  });
});
