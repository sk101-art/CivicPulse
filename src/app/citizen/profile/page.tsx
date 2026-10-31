import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import {
  ChevronLeft, Zap, History, Star,
  MapPin, TrendingUp, Shield, Crown, FileText, Trophy
} from "lucide-react";
import Link from 'next/link';
import { AppHeader } from "@/components/layout/AppHeader";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { formatDateIST } from "@/lib/time/ist";
import { loadCitizenOverview, loadLeaderboard } from "@/lib/citizen/stats";
import { nextTierProgress } from "@/lib/citizen/statsPure";
import { displayLocation, issueTitle } from "@/lib/issues/display";

export const revalidate = 0;

const tierColors = {
  CITIZEN: 'var(--tier-citizen)',
  CONTRIBUTOR: 'var(--tier-contributor)',
  GUARDIAN: 'var(--tier-guardian)',
  AMBASSADOR: 'var(--tier-ambassador)'
};

export default async function CitizenProfile() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = session.user.id;

  const overview = await loadCitizenOverview(userId, { reportLimit: 10 });
  const { user, profile } = overview;
  if (!user || !profile) redirect('/login');

  // Rewards and leaderboard depend only on the profile: load them together.
  const [pointLogs, leaderboard] = await Promise.all([
    prisma.pointLog.findMany({
      where: { citizenId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    loadLeaderboard(userId, profile.reputation),
  ]);

  const progress = nextTierProgress(profile.reputation);
  const activeColor = tierColors[profile.tier as keyof typeof tierColors] || 'var(--accent-cyan)';
  const displayName = user.name || 'Citizen';

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden w-full h-full pb-24 lg:pb-0 bg-primary">
      <AppHeader
        title="Profile"
        subtitle="Citizen Identity"
        accentColor={activeColor}
        actionButton={
          <div className="flex items-center gap-3">
            <Link href="/citizen/dashboard" aria-label="Back to dashboard">
              <span className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 flex items-center gap-1.5 text-xs font-bold text-white/80 hover:text-white uppercase tracking-widest">
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Dashboard</span>
              </span>
            </Link>
            <LogoutButton variant="compact" testId="citizen-logout-button" />
          </div>
        }
      />

      <div className="p-6 md:p-8 space-y-12 max-w-7xl mx-auto min-w-0">
        {/* Profile Card */}
        <section
          className="relative rounded-3xl overflow-hidden bg-card border border-white/5 shadow-2xl"
          style={{ borderColor: `${activeColor}20` }}
        >
          <div
            className="absolute top-0 right-0 w-80 h-80 blur-[100px] opacity-10 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${activeColor}, transparent 70%)`, transform: 'translate(20%, -20%)' }}
          />

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center gap-8 px-6 py-8 md:px-12 md:py-12">
            <div className="space-y-4 min-w-0">
              <div
                data-testid="profile-tier"
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest font-bold"
                style={{ background: `${activeColor}15`, color: activeColor, border: `1px solid ${activeColor}25` }}
              >
                <Crown className="w-3 h-3" aria-hidden="true" />
                {profile.tier} tier
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-white uppercase break-words">
                  {displayName}
                </h2>
                <p className="font-medium text-sm text-white/70 break-all">
                  {user.email} • Citizen since {formatDateIST(user.createdAt, { year: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>

            <div className="flex flex-col md:items-end gap-2 min-w-0">
              <div data-testid="profile-reputation" className="text-5xl md:text-6xl font-display font-bold text-white tracking-tight">
                {profile.reputation}
              </div>
              <div className="text-xs font-mono uppercase tracking-[0.2em] font-black" style={{ color: activeColor }}>
                Reputation points
              </div>
              <div className="w-full md:w-56 space-y-1">
                <div
                  className="h-1.5 rounded-full bg-white/10 overflow-hidden"
                  role="progressbar"
                  aria-label="Progress to next tier"
                  aria-valuenow={progress.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full" style={{ width: `${progress.pct}%`, background: activeColor }} />
                </div>
                <p className="text-[11px] font-mono text-white/70 md:text-right">
                  {progress.next ? `${progress.pointsToNext} points to ${progress.next}` : 'Top tier reached'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-2 px-6 pb-8 md:px-12 md:pb-10 border-t border-white/5 pt-8">
            {[
              { label: 'Reports Filed', value: overview.reportsFiled, color: 'var(--accent-cyan)', icon: FileText },
              { label: 'Votes Cast', value: overview.votesCast, color: 'var(--accent-amber)', icon: TrendingUp },
              { label: 'Leaderboard Rank', value: `#${leaderboard.myRank}`, color: 'var(--accent-lime)', icon: Zap },
              { label: 'Identity', value: profile.verified ? 'Verified' : 'Active', color: 'var(--accent-electric-blue)', icon: Shield },
            ].map(s => (
              <div key={s.label} className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <s.icon className="w-3.5 h-3.5 shrink-0" style={{ color: s.color }} aria-hidden="true" />
                  <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/70 truncate">
                    {s.label}
                  </div>
                </div>
                <div data-testid={`profile-stat-${s.label.toLowerCase().replace(/\s+/g, '-')}`} className="text-3xl font-display font-bold text-white truncate">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div className="px-6 pb-8 md:px-12 md:pb-10 border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs font-mono text-white/60 break-all">
              Logged in as {user.email}
            </span>
            <LogoutButton variant="primary" testId="logout-button" />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* History Column (3/5) */}
          <div className="lg:col-span-3 space-y-6 min-w-0">
            <div className="flex items-center gap-3">
              <Star className="w-5 h-5 text-cyan" aria-hidden="true" />
              <h3 className="text-lg font-display font-bold text-white uppercase tracking-tight">Recent Activity</h3>
            </div>

            {overview.reports.length === 0 ? (
              <div className="p-12 rounded-2xl border-2 border-dashed border-white/10 text-center text-white/60 text-sm">
                No activity recorded yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {overview.reports.map((report) => {
                  const resolved = ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(report.issue.status);
                  return (
                    <Link
                      key={report.id}
                      href={`/citizen/report/${report.issueId}`}
                      className="group block rounded-2xl bg-card border border-white/5 hover:bg-white/[0.04] transition-all overflow-hidden min-w-0"
                    >
                      <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="px-2.5 py-1 rounded-md text-[9px] font-mono font-black uppercase tracking-widest"
                            style={{
                              background: resolved ? 'rgba(196,254,0,0.1)' : 'rgba(255,184,0,0.1)',
                              color: resolved ? 'var(--accent-lime)' : 'var(--accent-amber)',
                            }}
                          >
                            {report.issue.status}
                          </span>
                          {report.issue.isSeed && (
                            <span data-testid="seed-tag" className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              SEED
                            </span>
                          )}
                        </div>
                        <h4 className="font-display font-bold text-base text-white group-hover:text-cyan transition-colors line-clamp-2 break-words">
                          {issueTitle(report.issue.category, report.issue.address, report.issue.lat, report.issue.lng)}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-white/70 uppercase tracking-widest min-w-0">
                          <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{displayLocation(report.issue.address, report.issue.lat, report.issue.lng)}</span>
                        </div>
                      </div>
                      <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-white/60">
                          {formatDateIST(report.createdAt)}
                        </span>
                        <span className="text-[10px] font-mono text-white/70">
                          {report.role === 'CONFIRM' ? 'Added to existing issue' : 'Reported'}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Leaderboard + rewards (2/5) */}
          <div className="lg:col-span-2 space-y-10 min-w-0">
            <section className="space-y-4" aria-labelledby="leaderboard-heading">
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-amber-300" aria-hidden="true" />
                <h3 id="leaderboard-heading" className="text-lg font-display font-bold text-white uppercase tracking-tight">Leaderboard</h3>
              </div>
              <ol data-testid="leaderboard" className="rounded-2xl bg-card border border-white/5 divide-y divide-white/5">
                {leaderboard.rows.map((row) => (
                  <li
                    key={`${row.rank}-${row.name}`}
                    className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${row.isMe ? 'bg-cyan-500/10' : ''}`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="w-6 text-right font-mono text-white/70">{row.rank}</span>
                      <span className="truncate text-white">{row.name}{row.isMe ? ' (you)' : ''}</span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-mono uppercase text-white/60">{row.tier}</span>
                      <span className="font-mono font-bold text-white">{row.reputation}</span>
                    </span>
                  </li>
                ))}
                {!leaderboard.rows.some((r) => r.isMe) && (
                  <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm bg-cyan-500/10">
                    <span className="flex items-center gap-3">
                      <span className="w-6 text-right font-mono text-white/70">{leaderboard.myRank}</span>
                      <span className="text-white">You</span>
                    </span>
                    <span className="font-mono font-bold text-white">{profile.reputation}</span>
                  </li>
                )}
              </ol>
            </section>

            <section className="space-y-4" aria-labelledby="rewards-heading">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-magenta" aria-hidden="true" />
                <h3 id="rewards-heading" className="text-lg font-display font-bold text-white uppercase tracking-tight">Reward Logs</h3>
              </div>

              {pointLogs.length === 0 ? (
                <div className="p-10 rounded-3xl bg-card border border-white/5 text-center text-white/60 text-sm">
                  Earn points by reporting city hazards.
                </div>
              ) : (
                <ul className="space-y-3">
                  {pointLogs.map((log) => (
                    <li key={log.id} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl bg-card border border-white/5 px-4 py-3">
                      <div className="space-y-1 min-w-0">
                        <h4 className="font-bold text-sm text-white/90 leading-tight break-words">{log.reason}</h4>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-white/60">
                          {formatDateIST(log.createdAt)}
                        </p>
                      </div>
                      <span className={`text-sm font-display font-bold ${log.points >= 0 ? 'text-lime' : 'text-rose-300'}`}>
                        {log.points >= 0 ? '+' : ''}{log.points}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
