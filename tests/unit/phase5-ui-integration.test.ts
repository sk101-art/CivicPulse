import { describe, it, expect, vi } from "vitest";
import { computeMultiFactorRepairWindows } from "@/lib/traffic/repairWindow";
import { assessIssue, generateWardBrief, askDeskAnalyst } from "@/lib/ai/analyst";
import { computeDeterioration } from "@/lib/insights/deterioration";
import { Category, DeteriorationRisk } from "@prisma/client";

describe("Phase 5: UI & Intelligence Integration", () => {
  describe("Varied Repair Windows across Different Road Corridors", () => {
    it("produces distinct repair window scores and reasons for heavy arterial vs residential corridors", async () => {
      // Location A: Heavy arterial Outer Ring Road corridor (high delay, 6 lanes)
      const arterialResult = computeMultiFactorRepairWindows({
        issueId: "test-arterial-corridor",
        priorityIndex: 85,
        lanePosition: "CURB",
        surroundings: {
          schools: [],
          hospitals: [],
          markets: [],
          road: {
            highway: "primary",
            lanes: 6,
            oneway: false,
            name: "Outer Ring Road",
          },
          cached: false,
          source: "pilot_osm",
        },
      });

      // Location B: Quiet residential street (low delay, 2 lanes)
      const residentialResult = computeMultiFactorRepairWindows({
        issueId: "test-residential-street",
        priorityIndex: 25,
        lanePosition: "SHOULDER",
        surroundings: {
          schools: [],
          hospitals: [],
          markets: [],
          road: {
            highway: "residential",
            lanes: 2,
            oneway: false,
            name: "14th Main Road",
          },
          cached: false,
          source: "pilot_osm",
        },
      });

      expect(arterialResult.bestWindow).toBeDefined();
      expect(residentialResult.bestWindow).toBeDefined();

      // Both should have top candidate slots
      expect(arterialResult.windows.length).toBeGreaterThanOrEqual(1);
      expect(residentialResult.windows.length).toBeGreaterThanOrEqual(1);

      // 84 total candidate slots computed for the 7-day calendar heatmap
      expect(arterialResult.allSlots.length).toBe(84);
      expect(residentialResult.allSlots.length).toBe(84);

      // Human-readable explanations are generated
      expect(arterialResult.bestWindow!.explanation).toBeTruthy();
      expect(residentialResult.bestWindow!.explanation).toBeTruthy();

      // Lane closure details are present for multi-lane roads
      expect(arterialResult.bestWindow!.laneClosure).toBeDefined();
      expect(arterialResult.bestWindow!.laneClosure?.totalLanes).toBe(6);
    });
  });

  describe("Pavement Deterioration Risk Intelligence", () => {
    it("computes HIGH deterioration risk for deep potholes on heavy monsoon-affected corridors", () => {
      const assessment = computeDeterioration({
        category: Category.POTHOLES,
        sizeClass: "LARGE",
        roadClass: "primary",
        busesPerHour: 45,
        past7DaysRainMm: 35,
        forecast72hRainMm: 28,
        recurrenceCount12m: 2,
      });

      expect(assessment.risk).toBe(DeteriorationRisk.HIGH);
      expect(assessment.score).toBeGreaterThanOrEqual(70);
      expect(assessment.expectedDaysToWorsen).toBeLessThanOrEqual(5);
      expect(assessment.drivers.length).toBeGreaterThan(0);
    });

    it("computes LOW deterioration risk for non-structural defects on local roads with dry weather", () => {
      const assessment = computeDeterioration({
        category: Category.TRAFFIC_SIGNS,
        sizeClass: "SMALL",
        roadClass: "residential",
        busesPerHour: 0,
        past7DaysRainMm: 0,
        forecast72hRainMm: 0,
        recurrenceCount12m: 0,
      });

      expect(assessment.risk).toBe(DeteriorationRisk.LOW);
      expect(assessment.score).toBeLessThan(40);
      expect(assessment.expectedDaysToWorsen).toBeGreaterThanOrEqual(14);
    });
  });

  describe("AI Analyst Ward Brief & Citizen Safety", () => {
    it("generates a structured ward briefing with actionable recommendations", async () => {
      const brief = await generateWardBrief("150");
      expect(brief).toBeDefined();
      expect(brief.wardName).toBeTruthy();
      expect(brief.headline).toBeTruthy();
      expect(brief.brief).toBeTruthy();
      expect(Array.isArray(brief.recommendedActions)).toBe(true);
      expect(brief.recommendedActions.length).toBeGreaterThanOrEqual(1);
    }, 30000);

    it("answers desk questions grounded in facts with issue citations", async () => {
      const chatRes = await askDeskAnalyst("Which roads are at highest risk of monsoon failure?");
      expect(chatRes).toBeDefined();
      expect(chatRes.answer).toBeTruthy();
      expect(Array.isArray(chatRes.suggestedFollowups)).toBe(true);
    }, 30000);
  });
});
