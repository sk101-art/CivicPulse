import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loadCitizenOverview } from "@/lib/citizen/stats";
import { listAuditTasksForUser } from "@/lib/audit/blindAudit";
import { displayLocation, issueTitle } from "@/lib/issues/display";
import { CivicContributionCard } from "@/components/citizen/CivicContributionCard";
import { SelectedWardPulse } from "@/components/citizen/SelectedWardPulse";
import { ActiveReports, type HomeReportItem } from "@/components/citizen/ActiveReports";
import Link from "next/link";
import { FileText, CheckCircle2, ShieldCheck, Clock, Plus } from "lucide-react";

export const revalidate = 0;

export default async function CitizenDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CITIZEN") {
    redirect("/login/citizen");
  }

  const userId = session.user.id;
  if (!userId) {
    redirect("/login/citizen");
  }

  // Parallel fetch: personal overview + real eligible verification task count
  const [overview, auditListing] = await Promise.all([
    loadCitizenOverview(userId, { reportLimit: 4 }).catch(() => null),
    listAuditTasksForUser(userId).catch(() => ({ eligible: false, tasks: [] })),
  ]);

  const rawName = overview?.user?.name?.trim() || session.user.name?.trim() || "";
  const firstName = rawName ? rawName.split(/\s+/)[0] : "";
  const profile = overview?.profile ?? null;
  const userReports = overview?.reports ?? [];

  const overviewUnavailable = overview === null;
  const reportedCount = overview?.reportsFiled ?? null;
  const verifiedFixedCount = overview?.verifiedFixedCount ?? null;
  const verificationsCount = overview?.votesCast ?? null;
  const pendingCount = overview?.pendingCount ?? null;
  const eligibleAuditCount = auditListing.eligible ? auditListing.tasks.length : 0;

  const formattedReports: HomeReportItem[] = userReports.map((r) => ({
    id: r.id,
    issueId: r.issueId,
    title: issueTitle(r.issue.category, r.issue.address, r.issue.lat, r.issue.lng),
    category: r.issue.category,
    photoUrl: r.photoUrl,
    status: r.issue.status,
    createdAt: r.createdAt,
    address: displayLocation(r.issue.address, r.issue.lat, r.issue.lng),
    latitude: r.lat,
    longitude: r.lng,
    priorityScore: r.issue.priority,
    voteCount: 0,
    commentCount: r.issue._count?.comments || 0,
    isSeed: r.issue.isSeed || r.isSeed,
  }));

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-12 bg-[#F3F2EB]">
      <div className="p-6 md:p-8 lg:p-10 space-y-8 max-w-[1360px] mx-auto">
        {/* Top Header / Greeting Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-3xl sm:text-4xl text-[#293732] font-semibold tracking-tight">
              {firstName ? `Good morning, ${firstName}` : "Welcome back"}
            </h1>
            <p className="text-sm sm:text-base text-[#65736B] font-body">
              Track your submitted reports, verification activity, and selected ward status.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/citizen/report">
              <button className="py-2.5 px-5 rounded-xl font-medium text-xs sm:text-sm text-white flex items-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_4px_12px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px transition-all duration-150 cursor-pointer">
                <span>Report an Issue</span>
                <Plus className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>

        {/* 4 Personal KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Reports Submitted */}
          <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#E5E9E3] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div
                data-testid="kpi-reports-submitted"
                className="font-mono font-bold text-2xl text-[#293732] leading-none mb-1"
              >
                {reportedCount ?? '—'}
              </div>
              <div className="text-xs text-[#65736B] font-medium leading-tight">
                Reports Submitted
              </div>
            </div>
          </div>

          {/* Card 2: Verified Fixed */}
          <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#EFF6F1] border border-[#CFE4D4] flex items-center justify-center text-[#537C60] shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div
                data-testid="kpi-verified-fixed"
                className="font-mono font-bold text-2xl text-[#293732] leading-none mb-1"
              >
                {verifiedFixedCount ?? '—'}
              </div>
              <div className="text-xs text-[#65736B] font-medium leading-tight">
                Verified Fixed
              </div>
            </div>
          </div>

          {/* Card 3: Verifications */}
          <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#527B7A] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div
                data-testid="kpi-verifications"
                className="font-mono font-bold text-2xl text-[#293732] leading-none mb-1"
              >
                {verificationsCount ?? '—'}
              </div>
              <div className="text-xs text-[#65736B] font-medium leading-tight">
                Verifications
              </div>
            </div>
          </div>

          {/* Card 4: Pending */}
          <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#FDF6ED] border border-[#F4E3CB] flex items-center justify-center text-[#B68B63] shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div
                data-testid="kpi-pending"
                className="font-mono font-bold text-2xl text-[#293732] leading-none mb-1"
              >
                {pendingCount ?? '—'}
              </div>
              <div className="text-xs text-[#65736B] font-medium leading-tight">
                Pending
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid: Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Primary Area: My Recent Reports & Repair Verification Shortcut */}
          <div className="lg:col-span-7 space-y-6">
            <ActiveReports
              initialReports={formattedReports}
              eligibleAuditCount={eligibleAuditCount}
              isAuditEligible={auditListing.eligible}
            />
          </div>

          {/* Secondary Area: Contribution Progress & Selected Ward Pulse */}
          <div className="lg:col-span-5 space-y-6">
            <CivicContributionCard
              tier={profile?.tier ?? null}
              points={profile?.reputation ?? null}
              hasProfile={Boolean(profile)}
              dataUnavailable={overviewUnavailable || !profile}
            />

            <SelectedWardPulse />
          </div>
        </div>
      </div>
    </main>
  );
}
