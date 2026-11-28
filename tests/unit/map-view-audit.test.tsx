import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-leaflet", () => ({
  TileLayer: () => null,
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  Popup: () => null,
  GeoJSON: () => null,
  useMap: () => null,
}));

import { clusterMapIssues } from "@/lib/map/cluster";
import { CartoConfigNotice } from "@/components/map/CartoTileLayer";
import { IssuesNearMeMap } from "@/components/citizen/IssuesNearMeMap";

const setSelectedCategorySpy = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("category=WATERLOGGING"),
}));

vi.mock("@/context/GeoContext", () => ({
  useGeoContext: () => ({
    currentWard: {
      id: "ward-47",
      code: "47",
      wardLabel: "Ward 47",
      fullName: "Ward 47 • Bellanduru",
      lat: 12.9279,
      lng: 77.6762,
      hasGeometry: true,
    },
    wardData: {
      isLoading: false,
      error: null,
      stats: { totalReported: 2, inProgressCount: 1, resolvedCount: 0, criticalCount: 1, slaBreachedCount: 0 },
      categoryBreakdown: { POTHOLES: 1, WATERLOGGING: 1 },
      issues: [
        {
          id: "iss-1",
          category: "POTHOLES",
          title: "Pothole at ORR",
          location: "Bellandur Gate",
          lat: 12.928,
          lng: 77.6763,
          latitude: 12.928,
          longitude: 77.6763,
          status: "OPEN",
          statusLabel: "Open",
          priority: "CRITICAL",
          priorityScore: 90,
          slaBreached: false,
          slaDueAt: new Date().toISOString(),
          photoUrl: "/images/pothole-clean-evidence.jpg",
          note: "Deep crater near bus stop",
          reportCount: 1,
          commentCount: 0,
          createdAt: new Date().toISOString(),
        },
        {
          id: "iss-2",
          category: "WATERLOGGING",
          title: "Flooded junction",
          location: "Ecospace Gate",
          lat: 12.931,
          lng: 77.68,
          latitude: 12.931,
          longitude: 77.68,
          status: "CLAIMED_FIXED",
          statusLabel: "Repair Claimed",
          priority: "HIGH",
          priorityScore: 70,
          slaBreached: false,
          slaDueAt: new Date().toISOString(),
          photoUrl: "/images/evidence-drainage-clean.jpg",
          note: null,
          reportCount: 1,
          commentCount: 0,
          createdAt: new Date().toISOString(),
        },
      ],
      audits: [],
      pagination: { total: 2, returned: 2, offset: 0, limit: 100, hasMore: false },
    },
    selectedCategory: "ALL",
    setSelectedCategory: setSelectedCategorySpy,
    refreshWardData: vi.fn(),
    loadMoreWardIssues: vi.fn(),
  }),
}));

describe("Citizen Map View Audit & Regression Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clusterMapIssues groups nearby points at zoom 13 and expands all at zoom >= 16", () => {
    const pts = [
      { id: "a", lat: 12.928, lng: 77.676, priority: "CRITICAL" },
      { id: "b", lat: 12.9281, lng: 77.6761, priority: "LOW" },
      { id: "c", lat: 12.95, lng: 77.7, priority: "MEDIUM" },
    ];

    const clustered = clusterMapIssues(pts, 13);
    const totalCount = clustered.reduce((s, item) => s + (item.kind === "cluster" ? item.count : 1), 0);
    expect(totalCount).toBe(3); // Never discards issues
    expect(clustered.some((item) => item.kind === "cluster" && item.count === 2)).toBe(true);

    const expanded = clusterMapIssues(pts, 16);
    expect(expanded).toHaveLength(3);
    expect(expanded.every((item) => item.kind === "single")).toBe(true);
  });

  it("CartoConfigNotice uses citizen-friendly label without exposing env variable names", () => {
    const orig = process.env.NEXT_PUBLIC_CARTO_API_KEY;
    delete process.env.NEXT_PUBLIC_CARTO_API_KEY;
    const html = renderToStaticMarkup(<CartoConfigNotice />);
    expect(html).toContain("Using OpenStreetMap base map");
    expect(html).not.toContain("NEXT_PUBLIC_CARTO_API_KEY");
    if (orig !== undefined) process.env.NEXT_PUBLIC_CARTO_API_KEY = orig;
  });

  it("IssuesNearMeMap renders search, priority filters, Locate Me, ward-center distance label, and omits duplicate drawer category grid", () => {
    const html = renderToStaticMarkup(<IssuesNearMeMap />);
    expect(html).toContain('data-testid="map-search-input"');
    expect(html).toContain('data-testid="locate-me-btn"');
    expect(html).toContain("All Priority");
    expect(html).toContain("from ward center");
    expect(html).not.toContain("Category Breakdown");
  });
});
