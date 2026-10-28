import { describe, it, expect } from "vitest";
import { computePriority, PriorityInputs } from "@/lib/priority";
import { PRIORITY_CONFIG } from "@/config/priority";

describe("T34 Unit Test: Priority Index Engine & Worked Examples", () => {
  describe("Appendix A.4 Worked Examples", () => {
    it("matches Case 1: Large pothole on primary corridor in July with rain (CRITICAL 100)", () => {
      // Worked Example 1 from PLAN.md Appendix A.4:
      // Large pothole in the wheel path; primary road, 3 lanes, r = 0.5, 30 buses/h, bus stop within 50 m;
      // part lane blocked, access 0.2; open 30 h of a 72 h SLA; 1 previous recurrence; 3 reports; July with 35 mm forecast
      const inputs: PriorityInputs = {
        category: "POTHOLES",
        sizeClass: "large",
        lanePosition: "wheel_path",
        roadClass: "primary",
        lanes: 3,
        congestionR: 0.5,
        busesPerHour: 30,
        nearBusStop: true,
        blockedShare: "part_lane",
        accessOverride: 0.2,
        ageHours: 30,
        slaHours: 72,
        recurrences: 1,
        evidenceCount: 3,
        forecastRainMm72h: 35,
      };

      const nowJuly = new Date("2026-07-15T12:00:00+05:30");
      const res = computePriority(inputs, PRIORITY_CONFIG, nowJuly);

      // Verify individual factors
      expect(res.breakdown.s).toBeCloseTo(0.936, 2);
      expect(res.breakdown.e).toBeCloseTo(0.919, 2);
      expect(res.breakdown.v).toBeCloseTo(0.7, 2);
      expect(res.breakdown.u).toBeCloseTo(0.18, 2);
      expect(res.breakdown.p).toBeCloseTo(0.45, 2);
      expect(res.breakdown.c).toBeCloseTo(1.0, 2);
      expect(res.breakdown.seasonMultiplier).toBeCloseTo(1.68, 2);

      // Verify raw and final PI within ±0.5
      expect(Math.abs(res.breakdown.rawPi - 113.1)).toBeLessThanOrEqual(0.5);
      expect(res.pi).toBe(100);
      expect(res.band).toBe("CRITICAL");
      expect(res.breakdown.isFloorApplied).toBe(false);
    });

    it("matches Case 2: Broken footpath fully blocked near school in February (HIGH 60 with floor)", () => {
      // Worked Example 2 from PLAN.md Appendix A.4:
      // Broken footpath fully blocked near a school; residential, 1 lane, no samples, no buses;
      // access 0.3; open 200 h of 72 h; 1 report; February
      const inputs: PriorityInputs = {
        category: "FOOTPATH",
        sizeClass: "medium",
        lanePosition: "default",
        roadClass: "residential",
        lanes: 1,
        busesPerHour: 0,
        nearSchool: true,
        nearSchoolOrHospital: true,
        blockedShare: "full",
        accessOverride: 0.3,
        ageHours: 200,
        slaHours: 72,
        recurrences: 0,
        evidenceCount: 1,
        forecastRainMm72h: 0,
      };

      const nowFeb = new Date("2026-02-10T12:00:00+05:30");
      const res = computePriority(inputs, PRIORITY_CONFIG, nowFeb);

      // Verify individual factors
      expect(res.breakdown.s).toBeCloseTo(0.5, 2);
      expect(res.breakdown.e).toBeCloseTo(0.651, 2);
      expect(res.breakdown.v).toBeCloseTo(0.9, 2);
      expect(res.breakdown.u).toBeCloseTo(0.65, 2);
      expect(res.breakdown.p).toBeCloseTo(1.0, 2);
      expect(res.breakdown.c).toBeCloseTo(0.667, 2);
      expect(res.breakdown.seasonMultiplier).toBeCloseTo(1.0, 2);

      // Raw PI ~46.4, age 200h > 2x72h -> floor of 60 enforced
      expect(Math.abs(res.breakdown.rawPi - 46.4)).toBeLessThanOrEqual(0.5);
      expect(res.pi).toBe(60);
      expect(res.band).toBe("HIGH");
      expect(res.breakdown.isFloorApplied).toBe(true);
    });

    it("matches Case 3: Small trash pile on secondary road in April (MEDIUM 38.3)", () => {
      // Worked Example 3 from PLAN.md Appendix A.4:
      // Small trash pile; secondary road, 2 lanes, no samples, 5 buses/h;
      // nothing blocked, access 0.3; open 10 h of 72 h; 2 reports; April
      const inputs: PriorityInputs = {
        category: "TRASH",
        sizeClass: "small",
        lanePosition: "default",
        roadClass: "secondary",
        lanes: 2,
        busesPerHour: 5,
        blockedShare: "none",
        accessOverride: 0.3,
        ageHours: 10,
        slaHours: 72,
        recurrences: 0,
        evidenceCount: 2,
        forecastRainMm72h: 0,
      };

      const nowApr = new Date("2026-04-15T12:00:00+05:30");
      const res = computePriority(inputs, PRIORITY_CONFIG, nowApr);

      // Verify individual factors
      expect(res.breakdown.s).toBeCloseTo(0.21, 2);
      expect(res.breakdown.e).toBeCloseTo(0.799, 2);
      expect(res.breakdown.v).toBeCloseTo(0.7, 2);
      expect(res.breakdown.u).toBeCloseTo(0.065, 2);
      expect(res.breakdown.p).toBeCloseTo(0.083, 2);
      expect(res.breakdown.c).toBeCloseTo(0.833, 2);
      expect(res.breakdown.seasonMultiplier).toBeCloseTo(1.3, 2);

      // Verify raw and final PI within ±0.5
      expect(Math.abs(res.breakdown.rawPi - 38.3)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(res.pi - 38.3)).toBeLessThanOrEqual(0.5);
      expect(res.band).toBe("MEDIUM");
      expect(res.breakdown.isFloorApplied).toBe(false);
    });
  });

  describe("Defensive fallbacks & Missing inputs", () => {
    it("never throws with completely missing optional inputs and populates breakdown.missing", () => {
      const emptyInputs: PriorityInputs = {
        category: "POTHOLES",
      };

      expect(() => computePriority(emptyInputs)).not.toThrow();

      const res = computePriority(emptyInputs);
      expect(res.pi).toBeGreaterThan(0);
      expect(res.breakdown.missing.length).toBeGreaterThan(0);
      expect(res.breakdown.missing).toContain("sizeClass");
      expect(res.breakdown.missing).toContain("roadClass");
      expect(res.breakdown.missing).toContain("blockedShare");
    });
  });

  describe("Configurability", () => {
    it("alters results when config weights change without code changes", () => {
      const inputs: PriorityInputs = {
        category: "POTHOLES",
        sizeClass: "large",
        roadClass: "primary",
        lanes: 3,
        ageHours: 10,
        slaHours: 72,
      };

      const defaultRes = computePriority(inputs, PRIORITY_CONFIG);

      // Custom config with boosted severity weight
      const customConfig = {
        ...PRIORITY_CONFIG,
        weights: {
          ...PRIORITY_CONFIG.weights,
          severity: 0.6,
          exposure: 0.1,
        },
      };

      const customRes = computePriority(inputs, customConfig);
      expect(customRes.pi).not.toBe(defaultRes.pi);
    });
  });
});
