import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionProvider } from "next-auth/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/citizen/report/iss-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
import { buildIssueTimelineAndDetails } from "@/lib/issues/timeline";
import { ReportDetailView } from "@/components/report/ReportDetailView";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { EvidenceRole, Status } from "@prisma/client";

describe("Report timeline synchronization & GlobalHeader Sign Out", () => {
  it("never emits hardcoded Mar 10/12 dates or fake contractor/notes on an OPEN issue", () => {
    const createdAt = new Date("2026-11-25T04:29:00.000Z");
    const details = buildIssueTimelineAndDetails(
      {
        id: "iss-open-1",
        status: Status.OPEN,
        createdAt,
        reports: [
          {
            id: "rep-1",
            role: EvidenceRole.REPORT,
            note: "Actual user note from field",
            photoSha256: "abc123sha",
            signature: "sig-xyz",
            gpsAccuracyM: 4.5,
            capturedAt: createdAt,
            createdAt,
          },
        ],
        actions: [],
        assignments: [],
      },
      "Sujay"
    );

    expect(details.notes).toBe("Actual user note from field");
    expect(details.photoSha256).toBe("abc123sha");
    expect(details.timelineSteps[0].status).toBe("completed");
    expect(details.timelineSteps[0].timestamp).toContain("25 Nov 2026");
    expect(details.timelineSteps[1].status).toBe("current");
    expect(details.timelineSteps[1].timestamp).toBe("Pending");
    expect(details.timelineSteps[2].status).toBe("pending");
    expect(details.timelineSteps[2].timestamp).toBe("Pending");
    expect(details.timelineSteps[3].status).toBe("pending");
    expect(details.timelineSteps[3].timestamp).toBe("Pending");

    const html = renderToStaticMarkup(
      <ReportDetailView
        id="iss-open-1"
        category="POTHOLES"
        categoryLabel="Potholes"
        location="Near 12.9347, 77.6139"
        coordinates={{ lat: 12.9347, lng: 77.6139 }}
        reportedAt="25 Nov 2026"
        status="OPEN"
        statusLabel="Reported"
        priority="HIGH"
        priorityLabel="High Priority"
        reporterName="Sujay"
        notes={details.notes}
        photoSha256={details.photoSha256}
        signature={details.signature}
        gpsAccuracyM={details.gpsAccuracyM}
        timelineSteps={details.timelineSteps}
        auditLogs={details.auditLogs}
        verifications={details.verifications}
      />
    );

    expect(html).not.toContain("Mar 10");
    expect(html).not.toContain("Mar 12");
    expect(html).not.toContain("Apex Road Infrastructure");
    expect(html).not.toContain("Large pothole causing vehicle slowdown");
    expect(html).toContain("Actual user note from field");
  });

  it("synchronizes timestamps from ActionLog when issue progresses to CLAIMED_FIXED", () => {
    const t0 = new Date("2026-11-25T04:00:00.000Z");
    const t1 = new Date("2026-11-25T05:30:00.000Z");
    const t2 = new Date("2026-11-25T08:15:00.000Z");

    const details = buildIssueTimelineAndDetails(
      {
        id: "iss-claimed-1",
        status: Status.CLAIMED_FIXED,
        createdAt: t0,
        updatedAt: t2,
        contractorName: "Cauvery Infra",
        agency: { name: "BBMP Road Maintenance" },
        reports: [
          {
            id: "rep-1",
            role: EvidenceRole.REPORT,
            capturedAt: t0,
            createdAt: t0,
          },
        ],
        actions: [
          {
            id: "act-1",
            action: "ASSIGN_AGENCY",
            actorId: "desk-1",
            createdAt: t1,
          },
          {
            id: "act-2",
            action: "CLAIM_FIX",
            actorId: "desk-1",
            createdAt: t2,
          },
        ],
      },
      "Sujay"
    );

    expect(details.timelineSteps[1].status).toBe("completed");
    expect(details.timelineSteps[1].subtitle).toContain("BBMP Road Maintenance");
    expect(details.timelineSteps[2].status).toBe("completed");
    expect(details.timelineSteps[2].subtitle).toContain("Cauvery Infra");
    expect(details.timelineSteps[3].status).toBe("current");
    expect(details.timelineSteps[3].timestamp).toBe("In progress");
    expect(details.auditLogs).toHaveLength(2);
  });

  it("GlobalHeader renders a Sign Out button accessible on mobile and desktop", () => {
    const html = renderToStaticMarkup(
      <SessionProvider session={null}>
        <GlobalHeader role="CITIZEN" />
      </SessionProvider>
    );
    expect(html).toContain('data-testid="global-signout-btn"');
    expect(html).toContain("Sign Out");
  });
});
