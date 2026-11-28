import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Category } from "@prisma/client";
import FileReportPage from "@/app/citizen/report/page";
import { CaptureCamera } from "@/components/evidence/CaptureCamera";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/context/GeoContext", () => ({
  useOptionalGeoContext: () => ({
    currentWard: {
      id: "ward-47",
      code: "47",
      wardLabel: "Ward 47",
      fullName: "Ward 47 • Bellanduru",
    },
    refreshWardData: vi.fn(),
  }),
}));

vi.mock("@/hooks/useOfflineSync", () => ({
  newClientReportId: () => "11111111-1111-4111-8111-111111111111",
  useOfflineSync: () => ({
    isOnline: true,
    pendingCount: 0,
    isSyncing: false,
    lastSyncError: null,
    lastSyncedCount: 0,
    queueReport: vi.fn(),
    syncReports: vi.fn(),
  }),
}));

describe("Citizen Report an Issue Audit & Regression Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes all 12 Prisma Category enum values without missing categories", () => {
    const prismaCategories = Object.values(Category);
    expect(prismaCategories).toHaveLength(12);
    const html = renderToStaticMarkup(<FileReportPage />);
    for (const cat of prismaCategories) {
      expect(html).toContain(`data-testid="category-card-${cat}"`);
    }
  });

  it("FileReportPage renders all 12 category cards and no hardcoded demo evidence", () => {
    const html = renderToStaticMarkup(<FileReportPage />);
    for (const cat of Object.values(Category)) {
      expect(html).toContain(`data-testid="category-card-${cat}"`);
    }
    expect(html).not.toContain("camera-preview-sample.jpg");
  });

  it("CaptureCamera in REPORT mode starts with Pending security states and no fabricated GPS", () => {
    const html = renderToStaticMarkup(
      <CaptureCamera role="REPORT" onCapture={vi.fn()} />
    );
    expect(html).toContain('data-testid="evidence-security-panel"');
    expect(html).toContain("Pending");
    expect(html).toContain("Waiting for GPS fix...");
    expect(html).not.toContain("12.9347");
    expect(html).not.toContain("77.6139");
    expect(html).not.toContain("4.8 m");
    expect(html).not.toContain("Video Mode");
  });

  it("CaptureCamera in CLAIM_FIX mode preserves targetCoords for Municipal Desk", () => {
    const html = renderToStaticMarkup(
      <CaptureCamera
        role="CLAIM_FIX"
        targetCoords={{ lat: 12.9512, lng: 77.6987 }}
        onCapture={vi.fn()}
      />
    );
    expect(html).toContain("12.95120° N, 77.69870° E");
    expect(html).toContain("Within City Limits");
  });
});
