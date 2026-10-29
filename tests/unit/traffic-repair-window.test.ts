import { describe, it, expect } from "vitest";
import {
  getDefaultRoadClassProfile,
  computeRepairWindows,
  formatIstTime,
} from "@/lib/traffic/repairWindow";

describe("Recommended Repair Window Selection & Profiles", () => {
  describe("getDefaultRoadClassProfile", () => {
    it("generates 168-hour profile with peaks at 8-11 and 17-21 IST", () => {
      const profile = getDefaultRoadClassProfile("primary");
      expect(profile).toHaveLength(168);

      // Check a weekday (e.g. Monday: hours 24 to 47)
      // Night (01:00 IST): hour 25
      const nightCongestion = profile[25];
      // Morning peak (09:00 IST): hour 33
      const morningPeak = profile[33];
      // Midday (14:00 IST): hour 38
      const midday = profile[38];
      // Evening peak (18:00 IST): hour 42
      const eveningPeak = profile[42];

      expect(nightCongestion).toBeLessThan(midday);
      expect(midday).toBeLessThan(morningPeak);
      expect(morningPeak).toBeGreaterThanOrEqual(0.7);
      expect(eveningPeak).toBeGreaterThanOrEqual(0.7);
    });

    it("scales baseline congestion by road class (trunk/primary > secondary > tertiary > residential)", () => {
      const primary = getDefaultRoadClassProfile("primary");
      const secondary = getDefaultRoadClassProfile("secondary");
      const tertiary = getDefaultRoadClassProfile("tertiary");
      const residential = getDefaultRoadClassProfile("residential");

      // Hour 33 is 09:00 IST Monday
      expect(primary[33]).toBeGreaterThan(secondary[33]);
      expect(secondary[33]).toBeGreaterThan(tertiary[33]);
      expect(tertiary[33]).toBeGreaterThan(residential[33]);
    });
  });

  describe("computeRepairWindows (window selection with rain exclusion)", () => {
    // Fixed reference time: Monday 2026-10-26 06:00:00 UTC (11:30 IST)
    const fixedNow = new Date("2026-10-26T06:00:00.000Z");

    it("returns top 3 non-overlapping 2-hour windows with 'estimated' basis when no samples exist", () => {
      const rainByDay = new Map<string, number>(); // completely dry week

      const result = computeRepairWindows({
        issueId: "issue-123",
        roadClass: "primary",
        samples: [],
        rainByDay,
        now: fixedNow,
      });

      expect(result.issueId).toBe("issue-123");
      expect(result.basis).toBe("estimated");
      expect(result.sampleCount).toBe(0);
      expect(result.windows).toHaveLength(3);
      expect(result.bestWindow).not.toBeNull();

      // In estimated road profile, nighttime hours (01:00-03:00, 03:00-05:00, etc.) have lowest congestion (~10%)
      expect(result.bestWindow?.expectedCongestion).toBeLessThanOrEqual(0.25);
      expect(result.bestWindow?.condition).toMatch(/low traffic, dry/);
      expect(result.displayText).toMatch(/Best repair window:/);
      expect(result.displayText).toMatch(/based on 0 samples · estimated/);

      // Verify windows do not overlap
      const w0 = result.windows[0];
      const w1 = result.windows[1];
      const w2 = result.windows[2];
      const t0Start = new Date(w0.start).getTime();
      const t0End = new Date(w0.end).getTime();
      const t1Start = new Date(w1.start).getTime();
      const t1End = new Date(w1.end).getTime();
      const t2Start = new Date(w2.start).getTime();
      const t2End = new Date(w2.end).getTime();

      expect(t0End <= t1Start || t1End <= t0Start).toBe(true);
      expect(t1End <= t2Start || t2End <= t1Start).toBe(true);
      expect(t0End <= t2Start || t2End <= t0Start).toBe(true);
    });

    it("uses live samples when available and labels basis as 'live' with sample count", () => {
      const rainByDay = new Map<string, number>();
      // Provide live samples for Tuesday 01:00-03:00 IST (day 2, hours 49 and 50)
      const samples = [
        { hourOfWeek: 49, congestionR: 0.04 },
        { hourOfWeek: 50, congestionR: 0.06 },
        { hourOfWeek: 73, congestionR: 0.05 }, // Wednesday
      ];

      const result = computeRepairWindows({
        issueId: "issue-live-1",
        roadClass: "primary",
        samples,
        rainByDay,
        now: fixedNow,
      });

      expect(result.basis).toBe("live");
      expect(result.sampleCount).toBe(3);
      expect(result.displayText).toMatch(/based on 3 samples · live/);
    });

    it("excludes hours on days with forecast rain >= 5.0 mm", () => {
      const rainByDay = new Map<string, number>();
      // Suppose Tuesday 2026-10-27 has heavy rain >= 5.0 mm
      rainByDay.set("2026-10-27", 12.5); // heavy rain day
      rainByDay.set("2026-10-28", 0.0);  // dry
      rainByDay.set("2026-10-29", 1.2);  // light rain (< 5mm, dry)

      const result = computeRepairWindows({
        issueId: "issue-rain-test",
        roadClass: "primary",
        samples: [],
        rainByDay,
        now: fixedNow,
      });

      // No window in result.windows should fall on Tuesday 2026-10-27
      for (const win of result.windows) {
        const { dateStr } = formatIstTime(new Date(win.start));
        expect(dateStr).not.toBe("2026-10-27");
        expect(win.condition).toMatch(/dry/);
      }
    });

    it("falls back gracefully if all days in forecast exceed 5.0 mm", () => {
      const rainByDay = new Map<string, number>();
      // Mark all 7 days as rainy
      for (let d = 26; d <= 31; d++) {
        rainByDay.set(`2026-10-${d}`, 15.0);
      }
      rainByDay.set("2026-11-01", 15.0);
      rainByDay.set("2026-11-02", 15.0);

      const result = computeRepairWindows({
        issueId: "issue-monsoon",
        roadClass: "primary",
        samples: [],
        rainByDay,
        now: fixedNow,
      });

      // Should still find best windows without crashing, but condition notes rain likely
      expect(result.windows.length).toBeGreaterThan(0);
      expect(result.windows[0].condition).toMatch(/rain likely/);
    });
  });
});
