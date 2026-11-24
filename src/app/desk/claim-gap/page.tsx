import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClaimGapDashboard } from "@/components/public/ClaimGapDashboard";
import { loadClaimGapData } from "@/lib/issues/claimGapData";

export const revalidate = 0;

export default async function DeskClaimGapPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'AUTHORITY') {
    redirect('/login/staff');
  }

  const { hasSeedData, byWard, byDesk, periodDays } = await loadClaimGapData(30);

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-8 bg-[#F3F2EB]">
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Editorial Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#DDDCD3] pb-5">
          <div>
            <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider mb-1">
              GROUND VERIFICATION & DISPUTE LEDGER
            </div>
            <h1 className="text-3xl font-display font-bold text-[#293732] tracking-tight">
              Claim Gap Analysis
            </h1>
            <p className="text-xs text-[#65736B] font-sans mt-1">
              Audit the variance between contractor repair claims and ground physical verification evidence.
            </p>
          </div>
          <span className="text-xs font-mono font-semibold px-3 py-1.5 rounded-xl bg-[#FFFFFF] border border-[#DDDCD3] text-[#355858] shadow-sm self-start sm:self-auto">
            Verification Protocol Active
          </span>
        </div>

        {/* Claim Gap Dashboard */}
        <ClaimGapDashboard
          initialByWard={byWard}
          initialByDesk={byDesk}
          initialPeriod={periodDays}
        />
      </div>
    </main>
  );
}
