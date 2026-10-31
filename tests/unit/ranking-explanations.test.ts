import { describe, it, expect } from "vitest";
import { computeMultiFactorRepairWindows } from "@/lib/traffic/repairWindow";
import { getRulesFallback } from "@/lib/ai/providers/rules";

describe("Ranking Explanations Consistency (Tie & Non-Tie)", () => {
  it("generates 'equally good; earliest chosen' when candidate repair windows are tied in score and traffic", () => {
    // Both weekday and weekend have uniform low profiles, clear weather
    const hourlyProfiles = new Map<string, number>();
    for (let h = 0; h < 24; h++) {
      hourlyProfiles.set(`WEEKDAY-${h}`, 0.05);
      hourlyProfiles.set(`WEEKEND-${h}`, 0.05);
    }

    const result = computeMultiFactorRepairWindows({
      issueId: "test-tie-issue",
      category: "POTHOLES",
      lanePosition: "SHOULDER",
      priorityIndex: 40,
      hourlyProfiles,
      surroundings: {
        schools: [],
        hospitals: [],
        markets: [],
        road: { highway: "secondary", lanes: 2, oneway: false },
        cached: true,
        source: "pilot_osm",
      },
      now: new Date("2026-11-04T00:00:00.000Z"), // Wednesday
    });

    expect(result.bestWindow).not.toBeNull();
    const explanation = result.bestWindow?.explanation || "";
    expect(explanation).toContain("equally good; earliest chosen");
  });

  it("generates explicit differential text (e.g. higher delay, lane closure) when runner-up is strictly worse", () => {
    // Weekday has very heavy congestion, weekend has light traffic
    const hourlyProfiles = new Map<string, number>();
    for (let h = 0; h < 24; h++) {
      hourlyProfiles.set(`WEEKDAY-${h}`, 0.45);
      hourlyProfiles.set(`WEEKEND-${h}`, 0.10);
    }

    const result = computeMultiFactorRepairWindows({
      issueId: "test-nontie-issue",
      category: "POTHOLES",
      lanePosition: "CENTER", // Blocks active travel lane
      priorityIndex: 50,
      hourlyProfiles,
      surroundings: {
        schools: [],
        hospitals: [],
        markets: [],
        road: { highway: "primary", lanes: 2, oneway: false },
        cached: true,
        source: "pilot_osm",
      },
      now: new Date("2026-11-06T12:00:00.000Z"), // Friday
    });

    expect(result.bestWindow).not.toBeNull();
    const explanation = result.bestWindow?.explanation || "";
    // Explanation should state the real difference (delay %, lane blocking, or score difference), never a generic lie
    const hasValidDifferential =
      explanation.includes("delay") ||
      explanation.includes("points lower") ||
      explanation.includes("blocks active traffic lanes") ||
      explanation.includes("closes daytime traffic lanes");
    expect(hasValidDifferential).toBe(true);
    expect(explanation).not.toContain("Runner-up undefined");
  });

  it("G-ASSESS rules fallback states 'no adjustment required' on tie/zero adjustment, and explicit +/- on difference", () => {
    // Zero adjustment case
    const zeroAdjOutput = getRulesFallback("G-ASSESS", {
      priority: 50,
      deteriorationScore: 30,
      busesPerHour: 5,
      delayRatio: 0.10,
    });
    expect(zeroAdjOutput.priorityAdjustmentRecommended).toBe(0);
    expect(zeroAdjOutput.reasoning).toBe("Defect priority matches observed conditions; no adjustment required.");

    // Elevated adjustment case (+5 for high deterioration score >= 70)
    const elevatedOutput = getRulesFallback("G-ASSESS", {
      priority: 60,
      deteriorationScore: 75,
      busesPerHour: 35,
      delayRatio: 0.25,
    });
    expect(elevatedOutput.priorityAdjustmentRecommended).toBeGreaterThan(0);
    expect(elevatedOutput.reasoning).toContain(`Adjustment +${elevatedOutput.priorityAdjustmentRecommended} points recommended`);
  });
});
