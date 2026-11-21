import { ClaimGapDashboard } from "@/components/public/ClaimGapDashboard";
import { loadClaimGapData } from "@/lib/issues/claimGapData";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const revalidate = 0;

export default async function ClaimGapPage() {
  const [{ hasSeedData, byWard, byDesk, periodDays }, session] = await Promise.all([
    loadClaimGapData(30),
    getServerSession(authOptions),
  ]);

  const role = session?.user?.role || 'CITIZEN';

  return (
    <div className="min-h-screen bg-[#F3F2EB] text-[#293732] font-body flex flex-col">
      {session && <GlobalHeader role={role} />}

      <div className="flex-1 p-4 sm:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Navigation & Header */}
          <div className="flex items-center justify-between">
            <Link
              href={role === 'AUTHORITY' ? '/desk' : '/citizen/dashboard'}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#527B7A] hover:text-[#355858] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {role === 'AUTHORITY' ? 'Back to Operations Queue' : 'Back to Dashboard'}
            </Link>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-xl text-xs font-mono font-medium bg-[#FFFFFF] border border-[#DDDCD3] text-[#65736B] shadow-sm">
                Public Accountability Ledger
              </span>
            </div>
          </div>

          {/* Editorial Title Section (Row 4, Col 3) */}
          <div className="border-b border-[#DDDCD3] pb-5 space-y-1">
            <h1 className="text-3xl font-display font-bold text-[#293732] tracking-tight">
              Claim Gap
            </h1>
            <p className="text-xs sm:text-sm text-[#65736B] font-sans max-w-2xl">
              Compare municipal repair claims with ground verification.
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
    </div>
  );
}
