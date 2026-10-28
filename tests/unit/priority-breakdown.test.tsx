import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PriorityBreakdown } from "@/components/priority/PriorityBreakdown";
import { computePriority } from "@/lib/priority";
import { PRIORITY_CONFIG } from "@/config/priority";

describe("T35 Acceptance: PriorityBreakdown Component", () => {
  it("renders Worked Example 1 (Appendix A) with stacked bar, band chip, estimated tags, and sentence facts", () => {
    // Worked Example 1: Large pothole in wheel path on primary road
    const res1 = computePriority(
      {
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
      },
      PRIORITY_CONFIG,
      new Date("2026-07-15T12:00:00+05:30")
    );

    const html = renderToStaticMarkup(
      <PriorityBreakdown
        priority={res1.pi}
        band={res1.band}
        breakdown={res1.breakdown}
        sentenceFacts={res1.sentenceFacts}
      />
    );

    // Band chip and score
    expect(html).toContain("100.0");
    expect(html).toContain("CRITICAL BAND");

    // Stacked bar of weighted factors
    expect(html).toContain('data-testid="priority-stacked-bar"');
    expect(html).toContain("bg-purple-500");
    expect(html).toContain("bg-sky-500");
    expect(html).toContain("bg-amber-500");
    expect(html).toContain("bg-rose-500");
    expect(html).toContain("bg-emerald-500");

    // Show "estimated" next to E and U
    expect(html).toContain('data-testid="e-estimated"');
    expect(html).toContain('data-testid="u-estimated"');
    expect(html).toContain("estimated");

    // Template sentence built only from sentenceFacts
    expect(html).toContain('data-testid="priority-sentence"');
    expect(html).toContain("CRITICAL priority (100.0) — POTHOLES on primary");

    // No floor notice for Case 1
    expect(html).not.toContain("SLA breached");
  });

  it("renders Worked Example 2 with SLA floor notice (> 2x SLA)", () => {
    // Worked Example 2: Footpath open 200h of 72h
    const res2 = computePriority(
      {
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
      },
      PRIORITY_CONFIG,
      new Date("2026-02-10T12:00:00+05:30")
    );

    const html = renderToStaticMarkup(
      <PriorityBreakdown
        priority={res2.pi}
        band={res2.band}
        breakdown={res2.breakdown}
        sentenceFacts={res2.sentenceFacts}
      />
    );

    expect(html).toContain("60.0");
    expect(html).toContain("HIGH BAND");
    expect(html).toContain('data-testid="sla-floor-notice"');
    expect(html).toContain("SLA breached (&gt; 2x SLA): minimum priority floor of 60 enforced.");
  });

  it("renders Worked Example 3 (Medium trash pile)", () => {
    const res3 = computePriority(
      {
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
      },
      PRIORITY_CONFIG,
      new Date("2026-04-15T12:00:00+05:30")
    );

    const html = renderToStaticMarkup(
      <PriorityBreakdown
        priority={res3.pi}
        band={res3.band}
        breakdown={res3.breakdown}
        sentenceFacts={res3.sentenceFacts}
      />
    );

    expect(html).toContain("38.3");
    expect(html).toContain("MEDIUM BAND");
    expect(html).toContain("TRASH on secondary");
  });
});
