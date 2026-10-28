import { prisma } from "@/lib/db/prisma";
import { ClaimGapDashboard } from "@/components/public/ClaimGapDashboard";
import { aggregateClaimGap, type ClaimRecord } from "@/lib/issues/claimGap";
import Link from "next/link";
import { ArrowLeft, Activity } from "lucide-react";

export const revalidate = 0;

async function loadClaimGapData(periodDays: number = 30) {
  const thresholdDate = new Date(Date.now() - periodDays * 24 * 3600 * 1000);

  // 1. Fetch CLAIM_FIX action logs in last 30 days
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
  });

  const hasSeedData = claimLogs.some((l) => l.issue?.isSeed);

  // 2. Fetch all wards for lookup
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

  // 5. By Ward aggregation
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
    byWard.push(
      aggregateClaimGap(unassignedRecords, "unassigned", "Unassigned Area", "N/A")
    );
  }

  // 6. By Desk aggregation
  const deskRecordMap = new Map<string, ClaimRecord[]>();
  for (const r of claimRecords) {
    if (!deskRecordMap.has(r.actorId)) deskRecordMap.set(r.actorId, []);
    deskRecordMap.get(r.actorId)!.push(r);
  }

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

  for (const [actorId, records] of Array.from(deskRecordMap.entries())) {
    if (!allDeskUsers.some((d) => d.id === actorId)) {
      const u = deskMap.get(actorId);
      const name = u?.name || u?.email || "Desk Officer";
      byDesk.push(aggregateClaimGap(records, actorId, name, u?.email));
    }
  }

  return { hasSeedData, byWard, byDesk, periodDays };
}

export default async function ClaimGapPage() {
  const { hasSeedData, byWard, byDesk, periodDays } = await loadClaimGapData(30);

  return (
    <div className="min-h-screen bg-[#070b14] text-zinc-100 font-body p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/citizen/dashboard"
            className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
          <div className="flex items-center gap-3">
            {hasSeedData && (
              <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                seed
              </span>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
              Public Ledger
            </span>
          </div>
        </div>

        {/* Title Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-cyan font-mono text-xs uppercase tracking-widest">
            <Activity className="w-4 h-4" />
            Municipal Accountability Metric
          </div>
          <h1 className="text-3xl font-display font-black text-white">
            Claim Gap & Accountability Scorecard
          </h1>
          <p className="text-xs sm:text-sm font-mono text-white/60 max-w-3xl leading-relaxed">
            The Claim Gap measures the percentage of repair claims disputed by on-site citizens (disputed claims ÷ total claims). Lower claim gaps represent accurate and verified contractor work.
          </p>
        </div>

        {/* Dashboard Component */}
        <ClaimGapDashboard
          initialByWard={byWard}
          initialByDesk={byDesk}
          initialPeriod={periodDays}
        />
      </div>
    </div>
  );
}
