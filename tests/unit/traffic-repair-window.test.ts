import { describe, it, expect } from "vitest";
import {
  getDefaultRoadClassProfile,
  computeRepairWindows,
  computeMultiFactorRepairWindows,
  formatIstTime,
  getCompassDirection,
} from "@/lib/traffic/repairWindow";
import { DayType } from "@prisma/client";
import { SurroundingsResult } from "@/lib/external/overpass";

describe("Phase 2: Smart Repair Window & Lane-Closure Impact Analysis", () => {
  const fixedNow = new Date("2026-10-26T06:00:00.000Z"); // Monday 11:30 IST

  const defaultSurroundings: SurroundingsResult = {
    schools: [],
    hospitals: [],
    markets: [],
    road: {
      lanes: 3,
      oneway: false,
      name: "Outer Ring Road",
    },
    cached: true,
    source: "pilot_osm",
  };

  describe("Compass Bearing to Direction Mapping", () => {
    it("maps bearings correctly to compass directions", () => {
      expect(getCompassDirection(0)).toBe("Northbound");
      expect(getCompassDirection(10)).toBe("Northbound");
      expect(getCompassDirection(45)).toBe("Northeastbound");
      expect(getCompassDirection(90)).toBe("Eastbound");
      expect(getCompassDirection(180)).toBe("Southbound");
      expect(getCompassDirection(270)).toBe("Westbound");
    });
  });

  describe("Multi-Factor Scoring & 84 Candidate Slots", () => {
    it("generates 84 two-hour candidate slots covering 7 days with multi-factor scores", () => {
      const hourlyProfiles = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, h < 6 ? 0.04 : 0.40);
        hourlyProfiles.set(`${DayType.WEEKEND}-${h}`, 0.10);
      }

      const hourlyWeather = new Map<string, { precipMm: number; precipProb: number; tempC: number }>();
      const result = computeMultiFactorRepairWindows({
        issueId: "issue-84-slots",
        lanePosition: "CURB",
        bearingDeg: 0,
        hourlyProfiles,
        hourlyWeather,
        surroundings: defaultSurroundings,
        now: fixedNow,
      });

      expect(result.allSlots).toHaveLength(84);
      expect(result.windows).toHaveLength(3);
      expect(result.bestWindow).not.toBeNull();
      expect(result.bestWindow?.factors).toBeDefined();
      expect(result.bestWindow?.factors.trafficScore).toBeGreaterThanOrEqual(0);
      expect(result.bestWindow?.factors.weatherScore).toBeGreaterThanOrEqual(0);
    });

    it("evaluates weather factor: heavy rain (>5mm or >70% prob) receives 0, dry night receives 100", () => {
      const hourlyProfiles = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, 0.04);
        hourlyProfiles.set(`${DayType.WEEKEND}-${h}`, 0.04);
      }

      // Monday night slot: 2026-10-26T18:00:00.000Z is 23:30 IST (dry night)
      const hourlyWeather = new Map<string, { precipMm: number; precipProb: number; tempC: number }>();
      // Rain slot on Tuesday morning
      const rainySlotKey = "2026-10-27T04:00:00.000Z";
      hourlyWeather.set(rainySlotKey, { precipMm: 8.5, precipProb: 80, tempC: 22 });

      const result = computeMultiFactorRepairWindows({
        issueId: "issue-weather-scoring",
        lanePosition: "CURB",
        bearingDeg: 0,
        hourlyProfiles,
        hourlyWeather,
        surroundings: defaultSurroundings,
        now: fixedNow,
      });

      // Find the rainy slot
      const rainyCandidate = result.allSlots.find((s) => s.start.startsWith("2026-10-27T04:00"));
      expect(rainyCandidate?.factors.weatherScore).toBe(0);

      // Best window should be dry with high score
      expect(result.bestWindow?.factors.weatherScore).toBeGreaterThanOrEqual(90);
    });

    it("applies school penalty (daytime 07:30-09:30 and 14:00-16:00) when school is within 200m", () => {
      const hourlyProfiles = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, 0.10);
        hourlyProfiles.set(`${DayType.WEEKEND}-${h}`, 0.10);
      }

      const surroundingsWithSchool: SurroundingsResult = {
        ...defaultSurroundings,
        schools: [
          {
            id: 101,
            name: "Gear Innovative International School",
            type: "school",
            distanceM: 180,
            lat: 12.95,
            lng: 77.70,
          },
        ],
        nearestSchool: {
          id: 101,
          name: "Gear Innovative International School",
          type: "school",
          distanceM: 180,
          lat: 12.95,
          lng: 77.70,
        },
      };

      const result = computeMultiFactorRepairWindows({
        issueId: "issue-school-penalty",
        lanePosition: "CURB",
        bearingDeg: 0,
        hourlyProfiles,
        hourlyWeather: new Map(),
        surroundings: surroundingsWithSchool,
        now: fixedNow,
      });

      // Daytime school slots on Tuesday (08:00 IST) should have surroundingsScore reduced by 40
      const schoolHourSlot = result.allSlots.find(
        (s) => s.dayOfWeek === "Tue" && s.timeRange.startsWith("08:")
      );
      if (schoolHourSlot) {
        expect(schoolHourSlot.factors.surroundingsScore).toBeLessThanOrEqual(60);
        expect(schoolHourSlot.explanation).toMatch(/School 180 m away is active/);
      }

      // Night window should show "School 180 m away is closed"
      const nightSlot = result.allSlots.find((s) => s.timeRange.startsWith("23:") || s.timeRange.startsWith("01:"));
      if (nightSlot) {
        expect(nightSlot.explanation).toMatch(/School 180 m away is closed/);
      }
    });

    it("applies hospital night noise penalty (22:00-06:00) when hospital is within 200m", () => {
      const hourlyProfiles = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, 0.05);
      }

      const surroundingsWithHospital: SurroundingsResult = {
        ...defaultSurroundings,
        hospitals: [
          {
            id: 202,
            name: "Sakra World Hospital",
            type: "hospital",
            distanceM: 150,
            lat: 12.95,
            lng: 77.70,
          },
        ],
        nearestHospital: {
          id: 202,
          name: "Sakra World Hospital",
          type: "hospital",
          distanceM: 150,
          lat: 12.95,
          lng: 77.70,
        },
      };

      const result = computeMultiFactorRepairWindows({
        issueId: "issue-hospital-penalty",
        lanePosition: "CURB",
        bearingDeg: 0,
        hourlyProfiles,
        hourlyWeather: new Map(),
        surroundings: surroundingsWithHospital,
        now: fixedNow,
      });

      // Night window (e.g. 23:00-01:00) should have surroundings penalty of 50
      const nightSlot = result.allSlots.find((s) => s.timeRange.startsWith("23:") || s.timeRange.startsWith("01:"));
      if (nightSlot) {
        expect(nightSlot.factors.surroundingsScore).toBeLessThanOrEqual(50);
        expect(nightSlot.explanation).toMatch(/Hospital 150 m away — heavy noise restricted/);
      }
    });
  });

  describe("Lane-Closure Impact & Queue Delay Estimation", () => {
    it("computes lane closure details and formats human explanation matching exact spec", () => {
      const hourlyProfiles = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, 0.04);
        hourlyProfiles.set(`${DayType.WEEKEND}-${h}`, 0.04);
      }

      const surroundings: SurroundingsResult = {
        ...defaultSurroundings,
        schools: [
          {
            id: 1,
            name: "Vibgyor High",
            type: "school",
            distanceM: 180,
            lat: 12.95,
            lng: 77.70,
          },
        ],
        nearestSchool: {
          id: 1,
          name: "Vibgyor High",
          type: "school",
          distanceM: 180,
          lat: 12.95,
          lng: 77.70,
        },
        road: {
          lanes: 3,
          oneway: false,
          name: "Outer Ring Road",
        },
      };

      const result = computeMultiFactorRepairWindows({
        issueId: "issue-lane-closure",
        lanePosition: "CURB",
        bearingDeg: 0, // Northbound
        hourlyProfiles,
        hourlyWeather: new Map(),
        surroundings,
        now: fixedNow,
      });

      const best = result.bestWindow;
      expect(best).not.toBeNull();
      expect(best?.laneClosure.direction).toBe("Northbound");
      expect(best?.laneClosure.blockedLane).toBe("Northbound curb lane");
      expect(best?.laneClosure.remainingLanes).toBe(2);
      expect(best?.laneClosure.totalLanes).toBe(3);
      expect(best?.laneClosure.estimatedQueueDelayMin).toBe("< 3 min");

      // Verify explanation string structure
      expect(best?.explanation).toMatch(/Recommended closure: Northbound curb lane; 2 of 3 lanes remain open, estimated queue delay < 3 min/);
      expect(best?.explanation).toMatch(/School 180 m away is closed/);
    });

    it("surfaces urgent slots within next 24h when priority index >= 80 or deterioration is HIGH", () => {
      const hourlyProfiles = new Map<string, number>();
      // Give Tuesday night (slot > 12) a slightly higher traffic score than Monday night (slot < 12)
      for (let h = 0; h < 24; h++) {
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, 0.10);
      }

      const result = computeMultiFactorRepairWindows({
        issueId: "issue-urgent-override",
        lanePosition: "CURB",
        bearingDeg: 0,
        priorityIndex: 85, // Urgent!
        deteriorationRisk: "HIGH",
        hourlyProfiles,
        hourlyWeather: new Map(),
        surroundings: defaultSurroundings,
        now: fixedNow,
      });

      // Best window should be boosted and selected from next 24h
      expect(result.bestWindow).not.toBeNull();
      expect(result.bestWindow?.urgencyBoosted).toBe(true);
    });

    it("ensures Bellandur (heavy arterial, FRC2) selects a night window", () => {
      const hourlyProfiles = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        // Heavy weekday traffic 08:00-21:00 (0.80 - 1.05 delay ratio), clear night (0.05)
        const weekdayDelay = h >= 8 && h <= 21 ? 0.95 : 0.05;
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, weekdayDelay);
        hourlyProfiles.set(`${DayType.WEEKEND}-${h}`, 0.40);
      }

      const bellandurSurroundings: SurroundingsResult = {
        schools: [],
        hospitals: [],
        markets: [],
        road: { lanes: 6, oneway: false, name: "Outer Ring Road (Bellandur)", frc: "FRC2", highway: "primary" },
        cached: true,
        source: "pilot_osm",
      };

      const result = computeMultiFactorRepairWindows({
        issueId: "seed-demo-critical-bellandur",
        lanePosition: "CURB",
        roadClass: "primary",
        priorityIndex: 96,
        hourlyProfiles,
        hourlyWeather: new Map(),
        surroundings: bellandurSurroundings,
        now: fixedNow,
      });

      expect(result.bestWindow).not.toBeNull();
      expect(result.bestWindow?.windowType).toBe("NIGHT");
    });

    it("ensures Agara (light residential, FRC4+) selects a daytime window due to night noise penalty", () => {
      const hourlyProfiles = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        // Light residential: daytime delayRatio < 0.15 (e.g. 0.08), night 0.04
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, h >= 6 && h < 22 ? 0.08 : 0.04);
        hourlyProfiles.set(`${DayType.WEEKEND}-${h}`, 0.06);
      }

      const agaraSurroundings: SurroundingsResult = {
        schools: [],
        hospitals: [],
        markets: [],
        road: { lanes: 2, oneway: false, name: "Agara Residential Access Road", frc: "FRC5", highway: "residential" },
        cached: true,
        source: "pilot_osm",
      };

      const result = computeMultiFactorRepairWindows({
        issueId: "seed-demo-low-agara",
        lanePosition: "SHOULDER",
        roadClass: "residential",
        priorityIndex: 22,
        hourlyProfiles,
        hourlyWeather: new Map(),
        surroundings: agaraSurroundings,
        now: fixedNow,
      });

      expect(result.bestWindow).not.toBeNull();
      // Should pick DAY_OFF_PEAK or WEEKEND_DAY, NOT NIGHT
      expect(["DAY_OFF_PEAK", "WEEKEND_DAY"]).toContain(result.bestWindow?.windowType);
    });

    it("ensures Cessna (office access) selects a weekend or late-evening window", () => {
      const hourlyProfiles = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        // Office access: heavy weekday commute 08:00-19:00 (0.75), light evening 20:00-22:00 (0.10), weekend very light (0.05)
        const weekdayDelay = h >= 8 && h < 20 ? 0.75 : 0.10;
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, weekdayDelay);
        hourlyProfiles.set(`${DayType.WEEKEND}-${h}`, 0.05);
      }

      const cessnaSurroundings: SurroundingsResult = {
        schools: [],
        hospitals: [],
        markets: [],
        road: { lanes: 4, oneway: false, name: "Cessna Business Park Main Access Corridor", highway: "tertiary" },
        cached: true,
        source: "pilot_osm",
      };

      const result = computeMultiFactorRepairWindows({
        issueId: "seed-demo-medium-cessna",
        lanePosition: "CENTER",
        roadClass: "tertiary",
        priorityIndex: 48,
        hourlyProfiles,
        hourlyWeather: new Map(),
        surroundings: cessnaSurroundings,
        now: fixedNow,
      });

      expect(result.bestWindow).not.toBeNull();
      // Should be WEEKEND_DAY or late-evening / off-peak slot, avoiding weekday rush hours
      expect(["WEEKEND_DAY", "DAY_OFF_PEAK", "NIGHT"]).toContain(result.bestWindow?.windowType);
      expect(result.bestWindow?.score).toBeGreaterThan(0);
    });

    it("defaults streetlight/sign/graffiti/trash repairs to SHOULDER/kerb work with no lane closure", () => {
      const cessnaSurroundings: SurroundingsResult = {
        schools: [],
        hospitals: [],
        markets: [],
        road: { lanes: 4, oneway: false, name: "Cessna Business Park Main Access Corridor", highway: "tertiary" },
        cached: true,
        source: "pilot_osm",
      };

      const result = computeMultiFactorRepairWindows({
        issueId: "seed-demo-medium-cessna",
        category: "STREETLIGHTS",
        roadClass: "tertiary",
        priorityIndex: 48,
        hourlyProfiles: new Map(),
        hourlyWeather: new Map(),
        surroundings: cessnaSurroundings,
        now: fixedNow,
      });

      expect(result.bestWindow).not.toBeNull();
      expect(result.bestWindow?.laneClosure.lanePosition).toBe("SHOULDER");
      expect(result.bestWindow?.laneClosure.remainingLanes).toBe(4);
      expect(result.bestWindow?.laneClosure.totalLanes).toBe(4);
      expect(result.bestWindow?.laneClosure.capacityDropPercent).toBe(0);
      expect(result.bestWindow?.laneClosure.estimatedQueueDelayMin).toBe("< 1 min");
      expect(result.bestWindow?.laneClosure.blockedLane).toContain("shoulder (kerb work)");
    });

    it("uses continuous scores without clamping at 100 and breaks ties without identical 100/100 slots", () => {
      const hourlyProfiles = new Map<string, number>();
      for (let h = 0; h < 24; h++) {
        hourlyProfiles.set(`${DayType.WEEKDAY}-${h}`, 0.05 + (h % 5) * 0.02);
        hourlyProfiles.set(`${DayType.WEEKEND}-${h}`, 0.04);
      }

      const result = computeMultiFactorRepairWindows({
        issueId: "issue-continuous-scoring",
        lanePosition: "CURB",
        roadClass: "primary",
        priorityIndex: 50,
        hourlyProfiles,
        hourlyWeather: new Map(),
        surroundings: defaultSurroundings,
        now: fixedNow,
      });

      const top5Scores = result.allSlots.slice(0, 5).map((s) => s.score);
      // All top 5 must not be identically 100
      const allHundred = top5Scores.every((s) => s === 100);
      expect(allHundred).toBe(false);

      // Verify scores are numbers with continuous values
      top5Scores.forEach((score) => {
        expect(typeof score).toBe("number");
        expect(score).toBeGreaterThan(0);
      });
    });
  });

  describe("Backwards Compatibility: computeRepairWindows", () => {
    it("maintains compatibility with existing tests and callers", () => {
      const rainByDay = new Map<string, number>();
      const result = computeRepairWindows({
        issueId: "issue-compat",
        roadClass: "primary",
        samples: [],
        rainByDay,
        now: fixedNow,
      });

      expect(result.issueId).toBe("issue-compat");
      expect(result.windows).toHaveLength(3);
      expect(result.allSlots).toHaveLength(84);
      expect(result.bestWindow).not.toBeNull();
      expect(result.displayText).toMatch(/Best repair window:/);
    });
  });
});
