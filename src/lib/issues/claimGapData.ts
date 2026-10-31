import "server-only";
import { prisma } from "@/lib/db/prisma";
import { aggregateClaimGap, type ClaimRecord } from "@/lib/issues/claimGap";
import { deskDisplayName } from "@/lib/issues/actors";

/**
 * Claim-gap numbers for the public page and /api/claim-gap, loaded in one parallel batch.
 * Desk rows carry display names only (e.g. "Desk A"); login emails never leave the server.
 */
export async function loadClaimGapData(periodDays: 30 | 90 = 30) {
  const thresholdDate = new Date(Date.now() - periodDays * 24 * 3600 * 1000);

  const [claimLogs, allWards, deskUsers] = await Promise.all([
    prisma.actionLog.findMany({
      where: {
        action: "CLAIM_FIX",
        createdAt: { gte: thresholdDate },
      },
      include: {
        issue: {
          select: {
            id: true,
            status: true,
            wardId: true,
            isSeed: true,
            verifications: {
              select: { id: true, verdict: true, createdAt: true },
              orderBy: { createdAt: "asc" },
            },
            actions: {
              where: { action: { in: ["VERIFY_FIX", "DISPUTE_FIX"] } },
              select: { action: true, createdAt: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ward.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "AUTHORITY" },
      select: { id: true, email: true, name: true },
    }),
  ]);

  const hasSeedData = claimLogs.some((l) => l.issue?.isSeed);
  const wardLookup = new Map(allWards.map((w) => [w.id, w]));
  const deskMap = new Map(deskUsers.map((u) => [u.id, u]));

  const claimRecords: ClaimRecord[] = claimLogs.map((log) => {
    const wardInfo = log.issue?.wardId ? wardLookup.get(log.issue.wardId) : undefined;

    const disputeVerification = log.issue?.verifications?.find((v) => v.verdict === "NOT_FIXED");
    const disputeAction = log.issue?.actions?.find((a) => a.action === "DISPUTE_FIX");
    const fixedVerification = log.issue?.verifications?.find((v) => v.verdict === "FIXED");
    const verifyAction = log.issue?.actions?.find((a) => a.action === "VERIFY_FIX");

    let verdict: "FIXED" | "NOT_FIXED" | "PENDING" = "PENDING";
    let disputedAt: Date | null = null;
    let verifiedAt: Date | null = null;

    if (disputeVerification || disputeAction || log.issue?.status === "DISPUTED") {
      verdict = "NOT_FIXED";
      disputedAt = disputeVerification?.createdAt || disputeAction?.createdAt || log.createdAt;
    } else if (fixedVerification || verifyAction || log.issue?.status === "VERIFIED_FIXED") {
      verdict = "FIXED";
      verifiedAt = fixedVerification?.createdAt || verifyAction?.createdAt || log.createdAt;
    }

    return {
      id: log.id,
      issueId: log.issueId,
      actorId: log.actorId,
      actorName: deskDisplayName(deskMap.get(log.actorId)),
      wardId: log.issue?.wardId,
      wardCode: wardInfo?.code,
      wardName: wardInfo?.name,
      claimedAt: log.createdAt,
      verifiedAt,
      disputedAt,
      verdict,
    };
  });

  // By ward
  const wardRecords = new Map<string, ClaimRecord[]>();
  for (const r of claimRecords) {
    const key = r.wardId || "unassigned";
    if (!wardRecords.has(key)) wardRecords.set(key, []);
    wardRecords.get(key)!.push(r);
  }
  const byWard = allWards.map((w) => aggregateClaimGap(wardRecords.get(w.id) || [], w.id, w.name, w.code));
  const unassigned = wardRecords.get("unassigned");
  if (unassigned && unassigned.length > 0) {
    byWard.push(aggregateClaimGap(unassigned, "unassigned", "Unassigned Area", "N/A"));
  }

  // By desk: the seeded desks always appear; any other desk that claimed a fix is added.
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
      byDesk.push(aggregateClaimGap(records, actorId, deskDisplayName(deskMap.get(actorId))));
    }
  }

  return { hasSeedData, byWard, byDesk, periodDays, thresholdDate, totalClaims: claimRecords.length };
}
