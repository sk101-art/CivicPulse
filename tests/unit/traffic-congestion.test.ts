import { describe, it, expect } from "vitest";
import {
  calculateCongestionR,
  calculateMedianCongestionR,
  mapFrcToRoadClass,
  getHourOfWeekIST,
} from "@/lib/traffic/congestion";

describe("Traffic Congestion & Mapping Utilities", () => {
  describe("calculateCongestionR (r = 1 - current/freeFlow clamped [0, 1])", () => {
    it("computes congestion ratio correctly for typical traffic", () => {
      // 20 km/h on a 40 km/h road => 1 - 20/40 = 0.5
      expect(calculateCongestionR(20, 40)).toBe(0.5);
      // 30 km/h on a 60 km/h road => 0.5
      expect(calculateCongestionR(30, 60)).toBe(0.5);
      // 10 km/h on a 50 km/h road => 1 - 0.2 = 0.8
      expect(calculateCongestionR(10, 50)).toBe(0.8);
    });

    it("clamps to 1.0 for standstill or complete congestion", () => {
      // 0 km/h on a 50 km/h road => 1 - 0 = 1.0
      expect(calculateCongestionR(0, 50)).toBe(1.0);
    });

    it("clamps to 0.0 when vehicles travel at free-flow speed", () => {
      // 50 km/h on a 50 km/h road => 1 - 1 = 0.0
      expect(calculateCongestionR(50, 50)).toBe(0.0);
    });

    it("clamps to 0.0 when vehicles exceed free-flow speed (speeding)", () => {
      // 60 km/h on a 50 km/h road => 1 - 1.2 = -0.2 -> clamped to 0.0
      expect(calculateCongestionR(60, 50)).toBe(0.0);
    });

    it("safely handles edge cases like zero, negative, or invalid freeFlowSpeed", () => {
      expect(calculateCongestionR(10, 0)).toBe(0.0);
      expect(calculateCongestionR(10, -50)).toBe(0.0);
      expect(calculateCongestionR(NaN, 50)).toBe(0.0);
      expect(calculateCongestionR(10, NaN)).toBe(0.0);
      expect(calculateCongestionR(Infinity, 50)).toBe(0.0);
    });
  });

  describe("calculateMedianCongestionR", () => {
    it("returns null for empty or null samples", () => {
      expect(calculateMedianCongestionR([])).toBeNull();
      expect(calculateMedianCongestionR(null as never)).toBeNull();
    });

    it("computes median for odd number of samples", () => {
      const samples = [
        { congestionR: 0.8 },
        { congestionR: 0.2 },
        { congestionR: 0.5 },
      ];
      // Sorted: [0.2, 0.5, 0.8] -> median is 0.5
      expect(calculateMedianCongestionR(samples)).toBe(0.5);
    });

    it("computes median for even number of samples", () => {
      const samples = [
        { congestionR: 0.1 },
        { congestionR: 0.7 },
        { congestionR: 0.3 },
        { congestionR: 0.5 },
      ];
      // Sorted: [0.1, 0.3, 0.5, 0.7] -> median is (0.3 + 0.5) / 2 = 0.4
      expect(calculateMedianCongestionR(samples)).toBe(0.4);
    });

    it("handles single sample", () => {
      expect(calculateMedianCongestionR([{ congestionR: 0.35 }])).toBe(0.35);
    });
  });

  describe("mapFrcToRoadClass", () => {
    it("maps TomTom FRC codes to CivicPulse road classes", () => {
      expect(mapFrcToRoadClass("FRC0")).toBe("trunk");
      expect(mapFrcToRoadClass("frc0")).toBe("trunk");
      expect(mapFrcToRoadClass("0")).toBe("trunk");

      expect(mapFrcToRoadClass("FRC1")).toBe("primary");
      expect(mapFrcToRoadClass("1")).toBe("primary");

      expect(mapFrcToRoadClass("FRC2")).toBe("secondary");
      expect(mapFrcToRoadClass("2")).toBe("secondary");

      expect(mapFrcToRoadClass("FRC3")).toBe("tertiary");
      expect(mapFrcToRoadClass("3")).toBe("tertiary");

      expect(mapFrcToRoadClass("FRC4")).toBe("residential");
      expect(mapFrcToRoadClass("FRC5")).toBe("residential");

      expect(mapFrcToRoadClass("FRC6")).toBe("service");
      expect(mapFrcToRoadClass("FRC7")).toBe("service");
    });

    it("falls back to residential on null, undefined or unknown FRC", () => {
      expect(mapFrcToRoadClass(null)).toBe("residential");
      expect(mapFrcToRoadClass(undefined)).toBe("residential");
      expect(mapFrcToRoadClass("")).toBe("residential");
      expect(mapFrcToRoadClass("UNKNOWN_FRC")).toBe("residential");
    });
  });

  describe("getHourOfWeekIST", () => {
    it("computes hour of week in IST correctly", () => {
      // 2026-10-25 00:00:00 UTC is Sunday 05:30 IST -> day 0, hour 5 -> 5
      const date1 = new Date("2026-10-25T00:00:00.000Z");
      expect(getHourOfWeekIST(date1)).toBe(5);

      // Sunday 00:00 IST -> day 0, hour 0 -> 0
      // 2026-10-24 18:30:00 UTC is Sunday 00:00:00 IST
      const sundayMidnightIst = new Date("2026-10-24T18:30:00.000Z");
      expect(getHourOfWeekIST(sundayMidnightIst)).toBe(0);

      // Saturday 23:00 IST -> day 6, hour 23 -> 6 * 24 + 23 = 167
      // 2026-10-31 17:30:00 UTC is Saturday 23:00:00 IST
      const saturdayNightIst = new Date("2026-10-31T17:30:00.000Z");
      expect(getHourOfWeekIST(saturdayNightIst)).toBe(167);
    });
  });
});
