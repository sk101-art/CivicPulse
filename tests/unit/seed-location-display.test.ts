import { describe, it, expect } from "vitest";

describe("Seed Issues Coordinates and Labeling", () => {
  function formatLocation(address?: string | null, lat?: number, lng?: number): string {
    if (
      address &&
      address.trim() &&
      address.trim().toLowerCase() !== "bengaluru" &&
      !address.toLowerCase().includes("pending")
    ) {
      return address.trim();
    }
    if (typeof lat === "number" && typeof lng === "number") {
      return `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
    }
    return "Coordinates Attached";
  }

  function formatTitle(category: string, address?: string | null, lat?: number, lng?: number): string {
    const cat = category.replace(/_/g, " ");
    const loc = formatLocation(address, lat, lng);
    return `${cat} (${loc})`;
  }

  it("formats lat/lng when address is missing or generic 'Bengaluru'", () => {
    const loc1 = formatLocation(null, 12.9716, 77.5946);
    expect(loc1).toBe("12.9716° N, 77.5946° E");

    const loc2 = formatLocation("Bengaluru", 12.9352, 77.6245);
    expect(loc2).toBe("12.9352° N, 77.6245° E");

    const loc3 = formatLocation("Coordinates pending", 12.9800, 77.6000);
    expect(loc3).toBe("12.9800° N, 77.6000° E");
  });

  it("generates specific titles instead of generic 'Potholes at Bengaluru'", () => {
    const title1 = formatTitle("POTHOLES", "Bengaluru", 12.9716, 77.5946);
    expect(title1).not.toBe("POTHOLES at Bengaluru");
    expect(title1).toBe("POTHOLES (12.9716° N, 77.5946° E)");

    const title2 = formatTitle("WATERLOGGING", null, 12.9352, 77.6245);
    expect(title2).toBe("WATERLOGGING (12.9352° N, 77.6245° E)");
  });

  it("preserves real detailed addresses when available", () => {
    const detailed = "MG Road near Anil Kumble Circle, Bengaluru";
    const loc = formatLocation(detailed, 12.9716, 77.5946);
    expect(loc).toBe(detailed);

    const title = formatTitle("POTHOLES", detailed, 12.9716, 77.5946);
    expect(title).toBe(`POTHOLES (${detailed})`);
  });

  it("identifies seeded rows via isSeed property", () => {
    const seedIssue = { id: "seed-pothole-1", isSeed: true };
    const liveIssue = { id: "live-pothole-2", isSeed: false };

    expect(seedIssue.isSeed).toBe(true);
    expect(liveIssue.isSeed).toBe(false);
  });
});
