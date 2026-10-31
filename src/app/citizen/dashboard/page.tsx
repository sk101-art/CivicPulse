import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ReputationCard } from "@/components/citizen/ReputationCard";
import { ActiveReports } from "@/components/citizen/ActiveReports";
import Link from "next/link";
import { Zap, Plus, Compass } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

export const revalidate = 0;

export default async function CitizenDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CITIZEN') {
    redirect('/login');
  }

  const userId = session.user.id;
  if (!userId) { redirect('/login'); return null; }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      citizenProfile: true,
    }
  });

  const profile = user?.citizenProfile;
  if (!profile) { redirect('/login'); return null; }

  const userReports = await prisma.report.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      issue: {
        include: { _count: { select: { reports: true, comments: true } } }
      }
    }
  });

  const totalReportsCount = await prisma.report.count({ where: { userId, role: 'REPORT' } });
  const confirmationsCount = await prisma.report.count({ where: { userId, role: 'CONFIRM' } });
  const resolvedCount = userReports.filter(r => ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(r.issue.status)).length;
  const openAuditTasksCount = await prisma.auditTask.count({
    where: {
      status: 'OPEN',
      dueAt: { gt: new Date() },
      OR: [{ assigneeId: userId }, { assigneeId: null }],
    },
  });

  const stats = {
    reported: totalReportsCount,
    resolved: resolvedCount,
    votes: confirmationsCount,
    tier: profile.tier,
    xp: profile.reputation,
  };

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0">
      <AppHeader 
        title={user?.name ? `Welcome, ${user.name.split(' ')[0]}` : 'Dashboard'} 
        subtitle="Citizen Interface"
        actionButton={
          <Link href="/citizen/report">
            <button className="neon-btn neon-btn-cyan flex items-center gap-3 px-6 py-3 text-sm tracking-wider shadow-xl rounded-xl">
              <Plus className="w-5 h-5" />
              File Report
            </button>
          </Link>
        }
      />

      <div className="p-6 md:p-8 space-y-12 max-w-7xl mx-auto">
        {/* Blind Audit Missions CTA */}
        {openAuditTasksCount > 0 && (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 to-blue-950/40 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
                <Compass className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="text-sm font-bold font-mono text-white flex items-center gap-2">
                  <span>{openAuditTasksCount} Blind Audit Mission(s) Active</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    +25 XP per audit
                  </span>
                </div>
                <div className="text-xs font-mono text-white/50">
                  Verify nearby road repairs with cryptographic challenge bearings.
                </div>
              </div>
            </div>
            <Link
              href="/citizen/audit"
              className="px-4 py-2 rounded-xl bg-cyan-500 text-black font-bold text-xs font-mono hover:bg-cyan-400 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Compass className="w-4 h-4" />
              Open Audit Missions
            </Link>
          </div>
        )}

        {/* Top Row: Reputation + Stats */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Reputation Card */}
          <div className="xl:col-span-1">
            <ReputationCard tier={profile.tier} points={profile.reputation} />
          </div>

          {/* Stats Card */}
          <div className="xl:col-span-2 rounded-3xl p-6 md:p-8 relative overflow-hidden shadow-2xl bg-card border border-white/5"
               style={{ background: 'linear-gradient(135deg, rgba(0,245,212,0.03) 0%, transparent 100%)' }}>
            <div
              className="absolute top-0 right-0 w-64 h-64 blur-[80px] opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, var(--accent-cyan), transparent 70%)' }}
            />
            <div className="relative">
              <div className="flex items-center gap-3 mb-8">
                <Zap className="w-5 h-5 text-cyan" />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold opacity-30">
                  Analytics Overview
                </span>
              </div>
              
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-12">
                <div className="space-y-1">
                  <div className="text-5xl md:text-6xl font-display font-bold text-white tracking-tight leading-none">
                    {profile.reputation}
                  </div>
                  <span className="text-sm text-cyan uppercase tracking-[0.3em] font-black">Intelligence XP</span>
                </div>

                <div className="flex flex-wrap gap-10 md:gap-14 border-t md:border-t-0 border-white/5 pt-8 md:pt-0">
                  {[
                    { label: 'Reports', value: stats.reported, color: 'var(--accent-cyan)' },
                    { label: 'Resolved', value: stats.resolved, color: 'var(--accent-lime)' },
                    { label: 'Votes', value: stats.votes, color: 'var(--accent-amber)' },
                    { label: 'Tier Status', value: profile.tier, color: 'var(--tier-contributor)' },
                  ].map((s) => (
                    <div key={s.label} className="space-y-1 min-w-[80px]">
                      <div className="text-xl md:text-2xl font-display font-black tracking-tighter" style={{ color: s.color }}>
                        {s.value}
                      </div>
                      <div className="text-[8px] font-mono uppercase tracking-widest font-black opacity-30 whitespace-nowrap">
                        {s.label === 'Tier Status' ? 'Cont Status' : s.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Active Reports */}
        <ActiveReports
          key={userReports.length > 0 ? userReports[0].id : 'empty'}
          initialReports={userReports.map(r => {
            const displayAddress = (r.issue.address && r.issue.address.trim() && r.issue.address.toLowerCase() !== 'bengaluru' && !r.issue.address.toLowerCase().includes('pending') && !r.issue.address.includes('Report Location'))
              ? r.issue.address
              : `Near ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`;

            return {
              id: r.id,
              issueId: r.issueId,
              title: `${r.issue.category.replace(/_/g, ' ')} (${displayAddress})`,
              category: r.issue.category,
              status: r.issue.status,
              createdAt: r.createdAt,
              address: displayAddress,
              latitude: r.lat,
              longitude: r.lng,
              priorityScore: r.issue.priority,
              voteCount: r.issue._count?.reports || 0,
              commentCount: r.issue._count?.comments || 0,
              isSeed: r.issue.isSeed || r.isSeed,
            };
          })} />
      </div>
    </main>
  );
}
