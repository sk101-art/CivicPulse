import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Activity } from "lucide-react";

export const revalidate = 0;

function calculateMedian(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default async function WardPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Ward and its issues in parallel (links use the ward id; a ward code needs one extra query).
  const issueQuery = (wardId: string) =>
    prisma.issue.findMany({
      where: { wardId },
      include: {
        _count: { select: { reports: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  const [ward, issuesById] = await Promise.all([
    prisma.ward.findFirst({
      where: {
        OR: [{ id }, { code: id }],
      },
    }),
    issueQuery(id),
  ]);

  if (!ward) {
    notFound();
  }

  const issues = ward.id === id ? issuesById : await issueQuery(ward.id);

  // Calculate lifespan metrics
  const lifespans = issues
    .map((i) => i.lifespanDays)
    .filter((d): d is number => d !== null && d !== undefined);
  const medianLifespan = calculateMedian(lifespans);

  // Status counters
  const disputedCount = issues.filter((i) => i.status === "DISPUTED").length;
  const reopenedInWarranty = issues.filter((i) => i.status === "REOPENED_IN_WARRANTY").length;
  const claimedCount = issues.filter((i) =>
    ["CLAIMED_FIXED", "VERIFIED_FIXED", "DISPUTED", "REOPENED_IN_WARRANTY"].includes(i.status)
  ).length;

  const claimGapPercentage = claimedCount > 0 ? (disputedCount / claimedCount) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#070b14] text-zinc-100 font-body p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href="/claim-gap"
            className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Claim Gap Dashboard
          </Link>
          <span className="text-[11px] font-mono text-white/40 uppercase tracking-widest">
            CivicPulse Ward Ledger
          </span>
        </div>

        {/* Ward Header */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold">
            <Building2 className="w-3.5 h-3.5" />
            {ward.code}
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight">
            {ward.name}
          </h1>
          <p className="text-xs font-mono text-white/50">
            Public repair durability, contractor accountability, and municipal claim gap scorecard.
          </p>
        </div>

        {/* Core Ward Performance Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
            <span className="text-[11px] font-mono uppercase text-white/40 tracking-wider block">
              Median Repair Lifespan
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {medianLifespan !== null ? `${medianLifespan} days` : "N/A"}
            </div>
            <p className="text-[11px] font-mono text-white/40 pt-1">
              {lifespans.length > 0
                ? `Based on ${lifespans.length} audited repairs`
                : "Awaiting completed durability audits"}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
            <span className="text-[11px] font-mono uppercase text-white/40 tracking-wider block">
              Ward Claim Gap
            </span>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {claimedCount >= 3 ? `${claimGapPercentage.toFixed(1)}%` : "Under Review"}
            </div>
            <p className="text-[11px] font-mono text-white/40 pt-1">
              {disputedCount} disputed of {claimedCount} claimed fixes
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
            <span className="text-[11px] font-mono uppercase text-white/40 tracking-wider block">
              Reopened in Warranty
            </span>
            <div className="text-2xl font-bold font-mono text-rose-400">
              {reopenedInWarranty}
            </div>
            <p className="text-[11px] font-mono text-white/40 pt-1">
              Repairs failed under defect liability
            </p>
          </div>
        </div>

        {/* Issue Ledger */}
        <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Ward Issue & Repair Ledger
            </h3>
            <span className="text-xs font-mono text-white/40">
              {issues.length} records
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {issues.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-white/40">
                No road issues reported in this ward.
              </div>
            ) : (
              issues.map((issue) => (
                <Link
                  key={issue.id}
                  href={`/issue/${issue.id}`}
                  className="p-4 flex items-center justify-between hover:bg-white/[0.03] transition-colors block"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">
                        {issue.category.replace(/_/g, " ")}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/5 border border-white/10 text-white/60">
                        {issue.status.replace(/_/g, " ")}
                      </span>
                      {issue.lifespanDays !== null && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                          {issue.lifespanDays}d lifespan
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/50 font-mono">
                      {issue.address || "ORR Corridor, Bengaluru"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-cyan-400">
                      PI: {issue.priority.toFixed(1)}
                    </div>
                    <div className="text-[10px] font-mono text-white/40">
                      Band: {issue.band}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
