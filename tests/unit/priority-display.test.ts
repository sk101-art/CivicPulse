import { describe, it, expect } from "vitest";
import { getPriorityBand, formatPriority } from "@/lib/priority";

describe("Priority Index and Band Display (0-100 scale)", () => {
  it("maps Priority Index 0-100 scores to correct priority bands", () => {
    expect(getPriorityBand(95.0)).toBe("CRITICAL");
    expect(getPriorityBand(70.0)).toBe("CRITICAL");
    expect(getPriorityBand(69.9)).toBe("HIGH");
    expect(getPriorityBand(50.0)).toBe("HIGH");
    expect(getPriorityBand(49.9)).toBe("MEDIUM");
    expect(getPriorityBand(36.4)).toBe("MEDIUM");
    expect(getPriorityBand(30.0)).toBe("MEDIUM");
    expect(getPriorityBand(29.9)).toBe("LOW");
    expect(getPriorityBand(15.0)).toBe("LOW");
  });

  it("handles legacy fractional scores (0-1) correctly without producing bloated thousands", () => {
    expect(getPriorityBand(0.82)).toBe("CRITICAL");
    expect(getPriorityBand(0.45)).toBe("MEDIUM");
    expect(getPriorityBand(0.22)).toBe("LOW");
  });

  it("formats 36.4 and 39.0 as 0-100 Priority Index rather than 3640 PTS and 3900 PTS", () => {
    const formatted36 = formatPriority(36.4);
    expect(formatted36.score).toBe(36.4);
    expect(formatted36.scoreFormatted).toBe("36.4");
    expect(formatted36.band).toBe("MEDIUM");
    expect(formatted36.score).toBeLessThanOrEqual(100);

    const formatted39 = formatPriority(39.0);
    expect(formatted39.score).toBe(39);
    expect(formatted39.scoreFormatted).toBe("39.0");
    expect(formatted39.band).toBe("MEDIUM");
    expect(formatted39.score).toBeLessThanOrEqual(100);
  });

  it("normalizes legacy 0-1 fractions to clean 0-100 values", () => {
    const formattedLegacy = formatPriority(0.82);
    expect(formattedLegacy.score).toBe(82);
    expect(formattedLegacy.scoreFormatted).toBe("82.0");
    expect(formattedLegacy.band).toBe("CRITICAL");
  });
});
