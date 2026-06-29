import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ReputationCard } from "@/components/citizen/ReputationCard";
import { ActiveReports } from "@/components/citizen/ActiveReports";
import Link from "next/link";
import { Zap, Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

export const revalidate = 0;

export default async function CitizenDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== 'CITIZEN') {
    redirect('/login');
  }

  const userId = (session?.user as any)?.id;
  if (!userId) { redirect('/login'); return null; }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      citizenProfile: {
        include: {
          reports: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { _count: { select: { votes: true, comments: true } } }
          },
          _count: { select: { votes: true } }
        }
      }
    }
  });

  const profile = user?.citizenProfile;
  if (!profile) { redirect('/login'); return null; }

  const stats = {
    reported: profile.reports.length,
    resolved: profile.reports.filter((r: any) => r.status === 'RESOLVED').length,
    votes: profile._count?.votes || 0,
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
                  ].map((s, i) => (
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
        <ActiveReports initialReports={profile.reports.map((r: any) => ({
          id: r.id,
          title: r.title,
          category: r.category,
          status: r.status,
          createdAt: r.createdAt,
          address: r.address,
          latitude: r.latitude,
          longitude: r.longitude,
          priorityScore: r.priorityScore,
          voteCount: r._count?.votes || 0,
          commentCount: r._count?.comments || 0,
        }))} />
      </div>
    </main>
  );
}
