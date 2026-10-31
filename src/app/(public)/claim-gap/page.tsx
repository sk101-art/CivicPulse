import { ClaimGapDashboard } from "@/components/public/ClaimGapDashboard";
import { loadClaimGapData } from "@/lib/issues/claimGapData";
import Link from "next/link";
import { ArrowLeft, Activity } from "lucide-react";

export const revalidate = 0;

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
