import { prisma } from "@/lib/db/prisma";
import type { SegmentEventType } from "@prisma/client";

export type TimelineEventType = SegmentEventType | "HANDOFF";

export interface TimelineItem {
  id: string;
  type: TimelineEventType;
  title: string;
  description?: string | null;
  occurredAt: string; // ISO 8601
  agency?: string | null;
  fromAgency?: string | null;
  toAgency?: string | null;
  contractor?: string | null;
  workOrder?: string | null;
  source: string;
  sourceId?: string | null;
  isSeed: boolean;
  issueId?: string | null;
  category?: string | null;
  status?: string | null;
  priority?: number | null;
}

export interface SegmentTimelineResult {
  segment: {
    id: string;
    osmWayId: string;
    name: string | null;
    roadClass: string;
    lanes: number | null;
    busesPerHour: number;
    pedestrianEstimate: number;
    nearSchoolOrHospital: boolean;
    soleAccess: boolean;
    tracked: boolean;
  };
  stats: {
    totalEvents: number;
    activeIssues: number;
    verifiedFixes: number;
    resurfacedCount: number;
    recurrencesCount: number;
    utilityCuts: number;
  };
  timeline: TimelineItem[];
}

function formatEventTypeTitle(type: TimelineEventType): string {
  switch (type) {
    case "RESURFACED":
      return "Road Resurfaced";
    case "ROAD_CUT":
      return "Utility Road Cut";
    case "WATERLOGGED":
      return "Waterlogging Event";
    case "RECURRENCE":
      return "Defect Recurrence Detected";
    case "VERIFIED_FIX":
      return "Citizen Verified Fix";
    case "REPORTED":
      return "Defect Reported";
    case "HANDOFF":
      return "Agency Handoff";
    default:
      return type;
  }
}

export async function getSegmentTimeline(
  segmentId: string
): Promise<SegmentTimelineResult | null> {
  const segment = await prisma.roadSegment.findUnique({
    where: { id: segmentId },
    include: {
      events: {
        orderBy: { occurredAt: "desc" },
      },
      issues: {
        include: {
          agency: { select: { id: true, code: true, name: true } },
          reports: { select: { id: true, note: true, createdAt: true, isSeed: true } },
          actions: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!segment) {
    return null;
  }

  const items: TimelineItem[] = [];

  // 1. Process SegmentEvents
  for (const evt of segment.events) {
    items.push({
      id: `se-${evt.id}`,
      type: evt.type,
      title: formatEventTypeTitle(evt.type),
      description: evt.workOrder ? `Work Order: ${evt.workOrder}` : null,
      occurredAt: evt.occurredAt.toISOString(),
      agency: evt.agency,
      contractor: evt.contractor,
      workOrder: evt.workOrder,
      source: evt.source,
      sourceId: evt.sourceId,
      isSeed: evt.isSeed,
    });
  }

  // 2. Process Issues on this segment
  for (const issue of segment.issues) {
    // Initial Report
    items.push({
      id: `issue-${issue.id}-created`,
      type: "REPORTED",
      title: `Issue Reported: ${issue.category.replace(/_/g, " ")}`,
      description: issue.address || "Citizen submitted defect report",
      occurredAt: issue.createdAt.toISOString(),
      agency: issue.agency?.name || issue.agency?.code || null,
      source: "CITIZEN_REPORT",
      sourceId: issue.id,
      isSeed: issue.isSeed,
      issueId: issue.id,
      category: issue.category,
      status: issue.status,
      priority: issue.priority,
    });

    // Recurrence indicator if issue is marked as recurrence of an earlier issue
    if (issue.recurrenceOf) {
      items.push({
        id: `issue-${issue.id}-recurrence`,
        type: "RECURRENCE",
        title: `Defect Recurrence (${issue.category.replace(/_/g, " ")})`,
        description: `Recurrent defect linked to prior resolved issue #${issue.recurrenceOf.slice(0, 8)}`,
        occurredAt: issue.createdAt.toISOString(),
        agency: issue.agency?.name || issue.agency?.code || null,
        source: "SYSTEM_RECURRENCE",
        sourceId: issue.id,
        isSeed: issue.isSeed,
        issueId: issue.id,
        category: issue.category,
      });
    }

    // ActionLog entries (Handoffs, Verifications)
    for (const action of issue.actions) {
      if (action.action === "REASSIGN_AGENCY") {
        items.push({
          id: `action-${action.id}-handoff`,
          type: "HANDOFF",
          title: "Agency Handoff",
          description: action.note || "Jurisdiction transferred between municipal authorities",
          occurredAt: action.createdAt.toISOString(),
          agency: issue.agency?.name || issue.agency?.code || null,
          source: "DESK_ACTION",
          sourceId: action.id,
          isSeed: issue.isSeed,
          issueId: issue.id,
        });
      } else if (action.action === "VERIFIED_FIX") {
        items.push({
          id: `action-${action.id}-verified`,
          type: "VERIFIED_FIX",
          title: "Fix Verified by Citizens",
          description: action.note || "Citizen verification quorum reached; defect confirmed resolved",
          occurredAt: action.createdAt.toISOString(),
          agency: issue.agency?.name || issue.agency?.code || null,
          source: "CITIZEN_VERIFICATION",
          sourceId: action.id,
          isSeed: issue.isSeed,
          issueId: issue.id,
        });
      }
    }
  }

  // 3. Sort newest first
  items.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  // 4. Compute statistics
  const activeIssues = segment.issues.filter(
    (i) => i.status !== "VERIFIED_FIXED" && i.status !== "REJECTED"
  ).length;

  const verifiedFixes = items.filter((i) => i.type === "VERIFIED_FIX").length;
  const resurfacedCount = items.filter((i) => i.type === "RESURFACED").length;
  const recurrencesCount = items.filter((i) => i.type === "RECURRENCE").length;
  const utilityCuts = items.filter((i) => i.type === "ROAD_CUT").length;

  return {
    segment: {
      id: segment.id,
      osmWayId: segment.osmWayId.toString(),
      name: segment.name,
      roadClass: segment.roadClass,
      lanes: segment.lanes,
      busesPerHour: segment.busesPerHour,
      pedestrianEstimate: segment.pedestrianEstimate,
      nearSchoolOrHospital: segment.nearSchoolOrHospital,
      soleAccess: segment.soleAccess,
      tracked: segment.tracked,
    },
    stats: {
      totalEvents: items.length,
      activeIssues,
      verifiedFixes,
      resurfacedCount,
      recurrencesCount,
      utilityCuts,
    },
    timeline: items,
  };
}
