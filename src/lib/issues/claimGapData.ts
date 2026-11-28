import "server-only";
import { Category, EvidenceRole, Prisma, Status } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { aggregateClaimGap, type ClaimRecord } from "@/lib/issues/claimGap";
import { deskDisplayName } from "@/lib/issues/actors";
import { displayLocation } from "@/lib/issues/display";

export interface ClaimGapFilters {
  corporationId?: string;
  wardId?: string;
  agencyId?: string;
  category?: string;
  status?: string;
  outcome?: string;
  search?: string;
}

export interface ClaimIssueTimelineItem {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actorName: string;
  createdAt: string;
}

export interface ClaimIssueItem {
  id: string;
  code: string;
  category: string;
  status: Status;
  isSeed: boolean;
  description: string;
  location: string;
  lat: number;
  lng: number;
  ward: {
    id: string;
    code: string;
    wardNumber: number | null;
    name: string;
    corporationId: string | null;
    corporationName: string | null;
  } | null;
  agency: {
    id: string;
    code: string;
    name: string;
  } | null;
  contractorName: string | null;
  tenderId: string | null;
  assignedPersonnel: string | null;
  originalDate: string;
  originalPhotoUrl: string | null;
  claimedAt: string;
  claimPhotoUrl: string | null;
  claimActorName: string;
  verifiedAt: string | null;
  disputedAt: string | null;
  reopenedAt: string | null;
  verificationPhotoUrl: string | null;
  outcome: "FIXED" | "NOT_FIXED" | "REOPENED" | "PENDING";
  disputeReason: string | null;
  reopenReason: string | null;
  updatedAt: string;
  timeline: ClaimIssueTimelineItem[];
}

export interface ClaimGapSummary {
  totalClaims: number;
  verified: number;
  disputed: number;
  reopened: number;
  awaitingVerification: number;
  claimGapRate: number;
}

function formatIssueCode(id: string): string {
  if (id.startsWith("CP-")) return id;
  const digits = id.replace(/\D/g, "");
  if (digits.length >= 4) return `CP-${digits.slice(-4)}`;
  return `CP-${id.slice(0, 6).toUpperCase()}`;
}

export async function loadClaimGapData(
  periodDays: 7 | 30 | 90 = 30,
  filters: ClaimGapFilters = {}
) {
  const now = new Date();
  const thresholdDate = new Date(now.getTime() - periodDays * 24 * 3600 * 1000);

  const whereAnd: Prisma.IssueWhereInput[] = [
    {
      OR: [
        {
          status: {
            in: [
              Status.CLAIMED_FIXED,
              Status.VERIFIED_FIXED,
              Status.DISPUTED,
              Status.REOPENED_IN_WARRANTY,
            ],
          },
        },
        { repairClaimedAt: { not: null } },
        {
          actions: {
            some: {
              action: {
                in: ["CLAIM_FIX", "VERIFY_FIX", "DISPUTE_FIX", "REOPEN", "REOPEN_IN_WARRANTY"],
              },
            },
          },
        },
      ],
    },
    {
      OR: [
        { repairClaimedAt: { gte: thresholdDate, lte: now } },
        {
          actions: {
            some: {
              action: {
                in: ["CLAIM_FIX", "VERIFY_FIX", "DISPUTE_FIX", "REOPEN", "REOPEN_IN_WARRANTY"],
              },
              createdAt: { gte: thresholdDate, lte: now },
            },
          },
        },
        {
          verifications: {
            some: {
              createdAt: { gte: thresholdDate, lte: now },
            },
          },
        },
      ],
    },
  ];

  if (filters.wardId && filters.wardId !== "ALL" && filters.wardId !== "zone-all") {
    whereAnd.push({ wardId: filters.wardId });
  }
  if (filters.agencyId && filters.agencyId !== "ALL") {
    whereAnd.push({ agencyId: filters.agencyId });
  }
  if (filters.category && filters.category !== "ALL" && Object.values(Category).includes(filters.category as Category)) {
    whereAnd.push({ category: filters.category as Category });
  }
  if (filters.status && filters.status !== "ALL" && Object.values(Status).includes(filters.status as Status)) {
    whereAnd.push({ status: filters.status as Status });
  }

  const [rawIssues, allWards, corporations, agencies, deskUsers] = await Promise.all([
    prisma.issue.findMany({
      where: { AND: whereAnd },
      include: {
        agency: { select: { id: true, code: true, name: true } },
        assignments: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: { personnel: { select: { name: true, role: true } } },
        },
        reports: {
          orderBy: { createdAt: "desc" },
          select: { id: true, role: true, photoUrl: true, note: true, createdAt: true },
        },
        verifications: {
          select: { id: true, verdict: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        actions: {
          select: {
            id: true,
            action: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            actorId: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.ward.findMany({
      select: {
        id: true,
        code: true,
        wardNumber: true,
        name: true,
        isLegacy: true,
        isOperationalArea: true,
        corporationId: true,
        corporation: { select: { id: true, name: true, shortName: true } },
      },
      orderBy: [{ wardNumber: "asc" }, { code: "asc" }],
    }),
    prisma.corporation.findMany({
      select: { id: true, code: true, name: true, shortName: true },
      orderBy: { name: "asc" },
    }),
    prisma.agency.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "AUTHORITY" },
      select: { id: true, email: true, name: true },
    }),
  ]);

  const wardLookup = new Map(allWards.map((w) => [w.id, w]));
  const deskMap = new Map(deskUsers.map((u) => [u.id, u]));

  const claimRecords: ClaimRecord[] = [];
  const issueItems: ClaimIssueItem[] = [];

  for (const iss of rawIssues) {
    const wardInfo = iss.wardId ? wardLookup.get(iss.wardId) : undefined;

    // Corporation filter (applied against resolved ward's corporationId)
    if (filters.corporationId && filters.corporationId !== "ALL") {
      if (!wardInfo || wardInfo.corporationId !== filters.corporationId) {
        continue;
      }
    }

    const claimAction = [...iss.actions].reverse().find((a) => a.action === "CLAIM_FIX");
    const disputeAction = [...iss.actions].reverse().find((a) => a.action === "DISPUTE_FIX");
    const reopenAction = [...iss.actions]
      .reverse()
      .find((a) => a.action === "REOPEN" || a.action === "REOPEN_IN_WARRANTY");
    const verifyAction = [...iss.actions].reverse().find((a) => a.action === "VERIFY_FIX");

    const disputeVerification = iss.verifications.find((v) => v.verdict === "NOT_FIXED");
    const fixedVerification = iss.verifications.find((v) => v.verdict === "FIXED");

    let outcome: "FIXED" | "NOT_FIXED" | "REOPENED" | "PENDING" = "PENDING";
    let disputedAt: Date | null = null;
    let reopenedAt: Date | null = null;
    let verifiedAt: Date | null = null;

    if (iss.status === Status.REOPENED_IN_WARRANTY || reopenAction) {
      outcome = "REOPENED";
      reopenedAt = reopenAction?.createdAt ?? iss.updatedAt;
    } else if (iss.status === Status.DISPUTED || disputeAction || disputeVerification) {
      outcome = "NOT_FIXED";
      disputedAt = disputeVerification?.createdAt ?? disputeAction?.createdAt ?? iss.updatedAt;
    } else if (iss.status === Status.VERIFIED_FIXED || verifyAction || fixedVerification) {
      outcome = "FIXED";
      verifiedAt = fixedVerification?.createdAt ?? verifyAction?.createdAt ?? iss.updatedAt;
    }

    const claimedAt = iss.repairClaimedAt ?? claimAction?.createdAt ?? iss.createdAt;
    const lifecycleDate =
      outcome === "REOPENED"
        ? (reopenedAt ?? claimedAt)
        : outcome === "NOT_FIXED"
          ? (disputedAt ?? claimedAt)
          : outcome === "FIXED"
            ? (verifiedAt ?? claimedAt)
            : claimedAt;

    if (lifecycleDate < thresholdDate || lifecycleDate > now) {
      continue;
    }

    if (filters.outcome && filters.outcome !== "ALL" && filters.outcome !== outcome) {
      continue;
    }

    const locationStr = displayLocation(iss.address, iss.lat, iss.lng);
    const codeStr = formatIssueCode(iss.id);

    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      const hay = [
        iss.id,
        codeStr,
        locationStr,
        wardInfo?.name ?? "",
        wardInfo?.code ?? "",
        iss.agency?.name ?? "",
        iss.contractorName ?? "",
        iss.category,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }

    const actorId = claimAction?.actorId ?? "desk-system";
    const actorName = claimAction
      ? deskDisplayName(deskMap.get(claimAction.actorId))
      : iss.agency?.name || "Municipal Operations Desk";

    const originalReport = iss.reports.find((r) => r.role === EvidenceRole.REPORT) ?? null;
    const claimReport = iss.reports.find((r) => r.role === EvidenceRole.CLAIM_FIX) ?? null;
    const verificationReport =
      iss.reports.find((r) => r.role === EvidenceRole.AUDIT || r.role === EvidenceRole.VERIFY) ?? null;

    claimRecords.push({
      id: claimAction?.id ?? iss.id,
      issueId: iss.id,
      actorId,
      actorName,
      wardId: iss.wardId,
      wardCode: wardInfo?.code,
      wardName: wardInfo?.name,
      claimedAt,
      verifiedAt,
      disputedAt,
      reopenedAt,
      verdict: outcome,
    });

    const assignment = iss.assignments[0];
    issueItems.push({
      id: iss.id,
      code: codeStr,
      category: iss.category || "OTHER",
      status: iss.status,
      isSeed: iss.isSeed,
      description: originalReport?.note || iss.piText || `${(iss.category || "OTHER").replace(/_/g, " ")} civic defect`,
      location: locationStr,
      lat: iss.lat,
      lng: iss.lng,
      ward: wardInfo
        ? {
            id: wardInfo.id,
            code: wardInfo.code,
            wardNumber: wardInfo.wardNumber,
            name: wardInfo.name,
            corporationId: wardInfo.corporationId,
            corporationName: wardInfo.corporation?.name ?? null,
          }
        : null,
      agency: iss.agency ?? null,
      contractorName: iss.contractorName ?? null,
      tenderId: iss.tenderId ?? null,
      assignedPersonnel: assignment?.personnel
        ? `${assignment.personnel.name} (${assignment.personnel.role})`
        : null,
      originalDate: iss.createdAt.toISOString(),
      originalPhotoUrl: originalReport?.photoUrl ?? null,
      claimedAt: claimedAt.toISOString(),
      claimPhotoUrl: claimReport?.photoUrl ?? null,
      claimActorName: actorName,
      verifiedAt: verifiedAt?.toISOString() ?? null,
      disputedAt: disputedAt?.toISOString() ?? null,
      reopenedAt: reopenedAt?.toISOString() ?? null,
      verificationPhotoUrl: verificationReport?.photoUrl ?? null,
      outcome,
      disputeReason: disputeAction?.note ?? (outcome === "NOT_FIXED" ? "Citizen verification disputed repair completion" : null),
      reopenReason: reopenAction?.note ?? null,
      updatedAt: iss.updatedAt.toISOString(),
      timeline: iss.actions.map((a) => ({
        id: a.id,
        action: a.action,
        fromStatus: a.fromStatus,
        toStatus: a.toStatus,
        note: a.note,
        actorName: deskMap.has(a.actorId) ? deskDisplayName(deskMap.get(a.actorId)) : "CivicPulse System / Citizen",
        createdAt: a.createdAt.toISOString(),
      })),
    });
  }

  // Aggregate Ward Scorecard from distinct claim records
  const wardRecords = new Map<string, ClaimRecord[]>();
  for (const r of claimRecords) {
    const key = r.wardId || "unassigned";
    if (!wardRecords.has(key)) wardRecords.set(key, []);
    wardRecords.get(key)!.push(r);
  }

  const byWard = allWards
    .filter((w) => !w.isLegacy || wardRecords.has(w.id))
    .filter((w) => {
      if (filters.wardId && filters.wardId !== "ALL" && filters.wardId !== "zone-all") {
        return w.id === filters.wardId;
      }
      if (filters.corporationId && filters.corporationId !== "ALL") {
        return w.corporationId === filters.corporationId;
      }
      return wardRecords.has(w.id);
    })
    .map((w) => {
      const label = w.wardNumber != null ? `Ward ${w.wardNumber} · ${w.name}` : w.name;
      return aggregateClaimGap(wardRecords.get(w.id) || [], w.id, label, w.code);
    })
    .sort((a, b) => b.claimed - a.claimed || b.disputedPercentage - a.disputedPercentage);

  const unassigned = wardRecords.get("unassigned");
  if (unassigned && unassigned.length > 0 && !filters.wardId && (!filters.corporationId || filters.corporationId === "ALL")) {
    byWard.push(aggregateClaimGap(unassigned, "unassigned", "Unassigned Area", "N/A"));
  }

  // By desk
  const deskRecords = new Map<string, ClaimRecord[]>();
  for (const r of claimRecords) {
    if (!deskRecords.has(r.actorId)) deskRecords.set(r.actorId, []);
    deskRecords.get(r.actorId)!.push(r);
  }
  const listedDesks = deskUsers.filter(
    (u) => deskRecords.has(u.id) || ["desk-a@civicpulse.local", "desk-b@civicpulse.local"].includes(u.email)
  );
  const byDesk = listedDesks
    .map((desk) => aggregateClaimGap(deskRecords.get(desk.id) || [], desk.id, deskDisplayName(desk)))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const [actorId, records] of Array.from(deskRecords.entries())) {
    if (!listedDesks.some((d) => d.id === actorId)) {
      byDesk.push(
        aggregateClaimGap(
          records,
          actorId,
          deskMap.has(actorId) ? deskDisplayName(deskMap.get(actorId)) : records[0]?.actorName || "Municipal Desk"
        )
      );
    }
  }

  const verifiedCount = issueItems.filter((i) => i.outcome === "FIXED").length;
  const disputedCount = issueItems.filter((i) => i.outcome === "NOT_FIXED").length;
  const reopenedCount = issueItems.filter((i) => i.outcome === "REOPENED").length;
  const awaitingCount = issueItems.filter((i) => i.outcome === "PENDING").length;
  const totalClaims = issueItems.length;
  const claimGapRate = totalClaims > 0 ? Math.round((disputedCount / totalClaims) * 1000) / 10 : 0;

  const summary: ClaimGapSummary = {
    totalClaims,
    verified: verifiedCount,
    disputed: disputedCount,
    reopened: reopenedCount,
    awaitingVerification: awaitingCount,
    claimGapRate,
  };

  return {
    hasSeedData: rawIssues.some((i) => i.isSeed),
    byWard,
    byDesk,
    records: issueItems,
    summary,
    periodDays,
    thresholdDate,
    totalClaims,
    filterOptions: {
      corporations,
      wards: allWards
        .filter((w) => !w.isLegacy || wardRecords.has(w.id))
        .map((w) => ({
          id: w.id,
          code: w.code,
          name: w.wardNumber != null ? `Ward ${w.wardNumber} · ${w.name}` : w.name,
          corporationId: w.corporationId,
        })),
      agencies,
    },
  };
}
