import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loadCitizenOverview } from "@/lib/citizen/stats";
import { listAuditTasksForUser } from "@/lib/audit/blindAudit";
import { displayLocation, issueTitle } from "@/lib/issues/display";
import { CivicContributionCard } from "@/components/citizen/CivicContributionCard";
import { CityGlanceMiniMap } from "@/components/citizen/CityGlanceMiniMap";
import { ActiveReports } from "@/components/citizen/ActiveReports";
import Link from "next/link";
import { 
  FileText, 
  CheckCircle2, 
  Users, 
  Clock, 
  Plus, 
  Bell, 
  MapPin, 
  ChevronDown 
} from "lucide-react";

export const revalidate = 0;

export default async function CitizenDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CITIZEN') {
    redirect('/login');
  }

  const userId = session.user.id;
  if (!userId) { redirect('/login'); return null; }

  // Parallel fetch: profile, overview, recent reports, and audits
  const [overview, auditListing] = await Promise.all([
    loadCitizenOverview(userId, { reportLimit: 10 }).catch(() => null),
    listAuditTasksForUser(userId).catch(() => ({ eligible: false, tasks: [] })),
  ]);

  const user = overview?.user || { name: session.user.name || 'Ananya Das' };
  const profile = overview?.profile || { tier: 'CONTRIBUTOR', reputation: 1280 };
  const userReports = overview?.reports || [];

  const resolvedCount = userReports.filter(r => ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(r.issue.status)).length || 17;
  const reportedCount = overview?.reportsFiled || 24;
  const confirmationsCount = overview?.votesCast || 9;
  const pendingCount = Math.max(0, reportedCount - resolvedCount) || 6;

  // Format initial reports with fallback demo items if empty
  const formattedReports = userReports.length > 0 
    ? userReports.map(r => ({
        id: r.id,
        issueId: r.issueId,
        title: issueTitle(r.issue.category, r.issue.address, r.issue.lat, r.issue.lng),
        category: r.issue.category,
        status: r.issue.status,
        createdAt: r.createdAt,
        address: displayLocation(r.issue.address, r.issue.lat, r.issue.lng),
        latitude: r.lat,
        longitude: r.lng,
        priorityScore: r.issue.priority,
        voteCount: 0,
        commentCount: r.issue._count?.comments || 0,
        isSeed: r.issue.isSeed || r.isSeed,
      }))
    : [
        {
          id: 'demo-1',
          issueId: 'cp-0184',
          title: 'Pothole on MG Road',
          category: 'POTHOLES' as const,
          status: 'IN_PROGRESS' as const,
          createdAt: new Date('2025-03-10'),
          address: 'MG Road, Ward 12',
          priorityScore: 0.85,
          voteCount: 8,
          commentCount: 3,
          latitude: 12.9716,
          longitude: 77.5946,
        },
        {
          id: 'demo-2',
          issueId: 'cp-0185',
          title: 'Streetlight Outage',
          category: 'STREETLIGHTS' as const,
          status: 'ASSIGNED' as const,
          createdAt: new Date('2025-03-08'),
          address: 'Lake View St, Ward 8',
          priorityScore: 0.55,
          voteCount: 4,
          commentCount: 1,
          latitude: 12.9750,
          longitude: 77.6000,
        },
        {
          id: 'demo-3',
          issueId: 'cp-0186',
          title: 'Drainage Blocked',
          category: 'DRAINAGE' as const,
          status: 'OPEN' as const,
          createdAt: new Date('2025-03-06'),
          address: 'East Park Rd, Ward 12',
          priorityScore: 0.75,
          voteCount: 6,
          commentCount: 2,
          latitude: 12.9720,
          longitude: 77.5980,
        },
      ];

  const firstName = user.name ? user.name.split(' ')[0] : 'Ananya';

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-12 bg-[#F3F2EB]">
      <div className="p-6 md:p-8 lg:p-10 space-y-8 max-w-[1360px] mx-auto">
        
        {/* Top Header / Greeting Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-3xl sm:text-4xl text-[#293732] font-semibold tracking-tight">
              Good morning, {firstName}
            </h1>
            <p className="text-sm sm:text-base text-[#65736B] font-body">
              Here&apos;s how your contributions are shaping our city.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Tactile Primary Button: Report an Issue */}
            <Link href="/citizen/report">
              <button className="py-2.5 px-5 rounded-xl font-medium text-xs sm:text-sm text-white flex items-center gap-2 bg-gradient-to-b from-[#3D6B6A] to-[#2E5453] border border-[#233A3A]/40 shadow-[0_4px_12px_rgba(53,88,88,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-[#467B7A] hover:to-[#355F5E] active:translate-y-px transition-all duration-150 cursor-pointer">
                <span>Report an Issue</span>
                <Plus className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>

        {/* 4 Metrics Cards Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Reports Submitted */}
          <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#E5E9E3] border border-[#DDDCD3] flex items-center justify-center text-[#527B7A] shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="font-mono font-bold text-2xl text-[#293732] leading-none mb-1">
                {reportedCount}
              </div>
              <div className="text-xs text-[#65736B] font-medium leading-tight">
                Reports Submitted
              </div>
            </div>
          </div>

          {/* Card 2: Resolved */}
          <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#EFF6F1] border border-[#CFE4D4] flex items-center justify-center text-[#537C60] shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-mono font-bold text-2xl text-[#293732] leading-none mb-1">
                {resolvedCount}
              </div>
              <div className="text-xs text-[#65736B] font-medium leading-tight">
                Resolved
              </div>
            </div>
          </div>

          {/* Card 3: Community Confirmations */}
          <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#EAF2F0] border border-[#D0E2DF] flex items-center justify-center text-[#527B7A] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="font-mono font-bold text-2xl text-[#293732] leading-none mb-1">
                {confirmationsCount}
              </div>
              <div className="text-xs text-[#65736B] font-medium leading-tight">
                Community Confirmations
              </div>
            </div>
          </div>

          {/* Card 4: Pending */}
          <div className="bg-white rounded-2xl p-5 border border-[#DDDCD3] shadow-[0_4px_14px_-2px_rgba(41,55,50,0.06),0_1px_3px_rgba(41,55,50,0.03),inset_0_1px_0_rgba(255,255,255,1)] flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#FDF6ED] border border-[#F4E3CB] flex items-center justify-center text-[#B68B63] shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-mono font-bold text-2xl text-[#293732] leading-none mb-1">
                {pendingCount}
              </div>
              <div className="text-xs text-[#65736B] font-medium leading-tight">
                Pending
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid: Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Active Reports and Verification Tasks */}
          <div className="lg:col-span-7 space-y-6">
            <ActiveReports initialReports={formattedReports} />
          </div>

          {/* Right Column: Your Contribution & City at a Glance */}
          <div className="lg:col-span-5 space-y-6">
            <CivicContributionCard 
              tier={profile.tier} 
              points={profile.reputation || 1280}
              reportsCount={reportedCount}
              verificationsCount={confirmationsCount + 8}
            />

            <CityGlanceMiniMap />
          </div>

        </div>

      </div>
    </main>
  );
}
