import { describe, it, expect } from "vitest";
import { getSegmentTimeline } from "@/lib/roads/timeline";
import { GET } from "@/app/api/segments/[id]/timeline/route";
import { NextRequest } from "next/server";

describe("T60 Contract & Unit Test: Road Timeline and History", () => {
  const pilotSegmentId = "seed-seg-orr-kadubeesanahalli";

  it("retrieves timeline for pilot road segment with correct metadata and stats", async () => {
    const data = await getSegmentTimeline(pilotSegmentId);
    expect(data).not.toBeNull();
    if (!data) return;

    expect(data.segment.id).toBe(pilotSegmentId);
    expect(data.segment.name).toContain("Outer Ring Road");
    expect(data.segment.roadClass).toBe("primary");
    expect(data.segment.lanes).toBe(6);
    expect(data.segment.busesPerHour).toBe(48);

    // Stats
    expect(data.stats.totalEvents).toBeGreaterThanOrEqual(4);
    expect(data.stats.resurfacedCount).toBeGreaterThanOrEqual(1);
    expect(data.stats.utilityCuts).toBeGreaterThanOrEqual(1);
    expect(data.stats.recurrencesCount).toBeGreaterThanOrEqual(1);
  });

  it("sorts timeline items newest first (chronological descending)", async () => {
    const data = await getSegmentTimeline(pilotSegmentId);
    expect(data).not.toBeNull();
    if (!data) return;

    const timeline = data.timeline;
    expect(timeline.length).toBeGreaterThan(1);

    for (let i = 0; i < timeline.length - 1; i++) {
      const current = new Date(timeline[i].occurredAt).getTime();
      const next = new Date(timeline[i + 1].occurredAt).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  it("contains seed tags and shows agency labels and handoffs", async () => {
    const data = await getSegmentTimeline(pilotSegmentId);
    expect(data).not.toBeNull();
    if (!data) return;

    // Check seed tags
    const seedItems = data.timeline.filter((item) => item.isSeed);
    expect(seedItems.length).toBeGreaterThan(0);

    // Check agency attribution
    const itemsWithAgency = data.timeline.filter((item) => item.agency);
    expect(itemsWithAgency.length).toBeGreaterThan(0);

    // Check handoff event exists
    const handoffItem = data.timeline.find((item) => item.type === "HANDOFF");
    expect(handoffItem).toBeDefined();
    expect(handoffItem?.description).toContain("Reassigned from BESCOM to BWSSB");

    // Check resurface event with contractor & work order
    const resurfacedItem = data.timeline.find((item) => item.type === "RESURFACED");
    expect(resurfacedItem).toBeDefined();
    expect(resurfacedItem?.contractor).toBe("Sri Lakshmi Infrastructure");
    expect(resurfacedItem?.workOrder).toBe("WO/GBA/2026/0411");
  });

  it("GET /api/segments/[id]/timeline returns 200 with JSON payload", async () => {
    const req = new NextRequest(`http://localhost:3000/api/segments/${pilotSegmentId}/timeline`);
    const res = await GET(req, { params: Promise.resolve({ id: pilotSegmentId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.segment.id).toBe(pilotSegmentId);
    expect(Array.isArray(body.timeline)).toBe(true);
    expect(body.timeline.length).toBeGreaterThan(0);
  });

  it("GET /api/segments/[id]/timeline returns 404 for unknown segment", async () => {
    const req = new NextRequest("http://localhost:3000/api/segments/non-existent-segment/timeline");
    const res = await GET(req, { params: Promise.resolve({ id: "non-existent-segment" }) });
    expect(res.status).toBe(404);
  });
});
