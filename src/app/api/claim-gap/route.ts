import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/api/errors";
import { aggregateClaimGap, type ClaimRecord } from "@/lib/issues/claimGap";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get("days");
    const periodDays = daysParam === "90" ? 90 : 30;
    const thresholdDate = new Date(Date.now() - periodDays * 24 * 3600 * 1000);

    // 1. Fetch all CLAIM_FIX action logs within the time period
    const claimLogs = await prisma.actionLog.findMany({
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
    });

    // 2. Fetch all wards for lookup and complete listing
    const allWards = await prisma.ward.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });
    const wardLookup = new Map(allWards.map((w) => [w.id, w]));

    // 3. Fetch desk users for display names
    const deskActorIds = Array.from(new Set(claimLogs.map((l) => l.actorId)));
    const deskUsers = await prisma.user.findMany({
      where: { id: { in: deskActorIds } },
      select: { id: true, email: true, name: true },
    });
    const deskMap = new Map(deskUsers.map((u) => [u.id, u]));

    // 4. Transform to ClaimRecord[]
    const claimRecords: ClaimRecord[] = claimLogs.map((log) => {
      const deskUser = deskMap.get(log.actorId);
      const wardInfo = log.issue?.wardId ? wardLookup.get(log.issue.wardId) : undefined;
      let actorName = "Desk Officer";
      if (deskUser?.email === "desk-a@civicpulse.local") {
        actorName = "Desk A";
      } else if (deskUser?.email === "desk-b@civicpulse.local") {
        actorName = "Desk B";
      } else if (deskUser?.name) {
        actorName = deskUser.name;
      }

      // Check dispute or verify from Verifications and ActionLogs
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
        actorEmail: deskUser?.email,
        actorName,
        wardId: log.issue?.wardId,
        wardCode: wardInfo?.code,
        wardName: wardInfo?.name,
        claimedAt: log.createdAt,
        verifiedAt,
        disputedAt,
        verdict,
      };
    });

    // 5. Group by Ward
    const wardMap = new Map<string, ClaimRecord[]>();
    for (const r of claimRecords) {
      const key = r.wardId || "unassigned";
      if (!wardMap.has(key)) wardMap.set(key, []);
      wardMap.get(key)!.push(r);
    }

    const byWard = allWards.map((w) => {
      const records = wardMap.get(w.id) || [];
      return aggregateClaimGap(records, w.id, w.name, w.code);
    });

    if (wardMap.has("unassigned")) {
      const unassignedRecords = wardMap.get("unassigned")!;
      if (unassignedRecords.length > 0) {
        byWard.push(
          aggregateClaimGap(unassignedRecords, "unassigned", "Unassigned Area", "N/A")
        );
      }
    }

    // 5. Group by Desk
    const deskRecordMap = new Map<string, ClaimRecord[]>();
    for (const r of claimRecords) {
      if (!deskRecordMap.has(r.actorId)) deskRecordMap.set(r.actorId, []);
      deskRecordMap.get(r.actorId)!.push(r);
    }

    // Always report for Desk A and Desk B
    const allDeskUsers = await prisma.user.findMany({
      where: {
        email: { in: ["desk-a@civicpulse.local", "desk-b@civicpulse.local"] },
      },
      select: { id: true, email: true, name: true },
    });

    const byDesk = allDeskUsers.map((desk) => {
      const records = deskRecordMap.get(desk.id) || [];
      const deskName =
        desk.email === "desk-a@civicpulse.local"
          ? "Desk A"
          : desk.email === "desk-b@civicpulse.local"
          ? "Desk B"
          : desk.name || desk.email;
      return aggregateClaimGap(records, desk.id, deskName, desk.email);
    });

    // Add any other desk actors who claimed fixes
    for (const [actorId, records] of Array.from(deskRecordMap.entries())) {
      if (!allDeskUsers.some((d) => d.id === actorId)) {
        const u = deskMap.get(actorId);
        const name = u?.name || u?.email || "Desk Officer";
        byDesk.push(aggregateClaimGap(records, actorId, name, u?.email));
      }
    }

    return NextResponse.json(
      {
        periodDays,
        thresholdDate: thresholdDate.toISOString(),
        totalClaims: claimRecords.length,
        byWard,
        byDesk,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error: unknown) {
    console.error("Failed to compute claim gap:", error);
    return apiError(500, "INTERNAL_ERROR", "Internal error computing claim gap");
  }
}
