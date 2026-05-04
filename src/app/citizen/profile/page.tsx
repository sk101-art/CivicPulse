import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { 
  ChevronLeft, Zap, History, Star, 
  MapPin, TrendingUp, Shield, Crown, FileText
} from "lucide-react";
import Link from 'next/link';
import { AppHeader } from "@/components/layout/AppHeader";

export const revalidate = 0;

export default async function CitizenProfile() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      citizenProfile: {
        include: {
          reports: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              _count: { select: { votes: true, comments: true } }
            }
          },
          _count: { select: { reports: true, votes: true } }
        }
      }
    }
  });

  if (!user || !user.citizenProfile) redirect('/login');

  const profile = user.citizenProfile;

  const pointLogs = await prisma.pointLog.findMany({
    where: { citizenId: profile.id },
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: { report: true }
  });

  const tierColors = {
    CITIZEN: 'var(--tier-citizen)',
    CONTRIBUTOR: 'var(--tier-contributor)',
    GUARDIAN: 'var(--tier-guardian)',
    AMBASSADOR: 'var(--tier-ambassador)'
  };

  const activeColor = tierColors[profile.tier as keyof typeof tierColors] || 'var(--accent-cyan)';

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0 bg-primary">
      <AppHeader 
        title="Profile" 
        subtitle="Citizen Identity"
        accentColor={activeColor}
        actionButton={
          <div className="flex items-center gap-4">
            <Link href="/citizen/dashboard">
              <button className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 flex items-center gap-2 text-xs font-bold text-white/70 hover:text-white uppercase tracking-widest">
                <ChevronLeft className="w-4 h-4" />
                Dashboard
              </button>
            </Link>
            <div className="hidden sm:flex flex-col items-end">
              <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">Status</p>
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: activeColor }}>{profile.tier}</p>
            </div>
          </div>
        }
      />

      <div className="p-6 md:p-8 space-y-12 max-w-7xl mx-auto">
        {/* Profile Card */}
        <section 
          className="relative rounded-3xl overflow-hidden bg-card border border-white/5 shadow-2xl"
          style={{ borderColor: `${activeColor}20` }}
        >
           {/* Background Decoration */}
           <div 
             className="absolute top-0 right-0 w-80 h-80 blur-[100px] opacity-10"
             style={{ background: `radial-gradient(circle, ${activeColor}, transparent 70%)`, transform: 'translate(20%, -20%)' }}
           />

           <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 px-8 py-10 md:px-12 md:py-14">
              <div className="space-y-4">
                 <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest font-bold"
                   style={{ background: `${activeColor}15`, color: activeColor, border: `1px solid ${activeColor}25` }}
                 >
                    <Crown className="w-3 h-3" />
                    {profile.tier} Rank
                 </div>
                 <div className="space-y-1">
                    <h2 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-white uppercase">
                      {user.name || user.email.split('@')[0]}
                    </h2>
                    <p className="font-medium text-base text-secondary">
                      {user.email} • Citizen since {new Date(user.createdAt).getFullYear()}
                    </p>
                 </div>
              </div>

              <div className="flex flex-col md:items-end gap-1">
                <div className="text-5xl md:text-6xl font-display font-bold text-white tracking-tight">
                  {profile.reputation}
                </div>
                <div className="text-sm font-mono uppercase tracking-[0.2em] font-black" style={{ color: activeColor }}>
                  Intelligence XP
                </div>
              </div>
           </div>

           <div className="flex flex-wrap items-center gap-12 mt-4 px-8 pb-10 md:px-12 md:pb-14 border-t border-white/5 pt-10">
              {[
                { label: 'Reports Filed', value: profile._count.reports, color: 'var(--accent-cyan)', icon: FileText },
                { label: 'Votes Cast', value: profile._count.votes, color: 'var(--accent-amber)', icon: TrendingUp },
                { label: 'Impact Score', value: `${Math.round(profile.reputation / 10)}%`, color: 'var(--accent-lime)', icon: Zap },
                { label: 'Identity', value: profile.verified ? 'Verified' : 'Active', color: 'var(--accent-electric-blue)', icon: Shield },
              ].map(s => (
                <div key={s.label} className="flex flex-col gap-1 pr-12 last:pr-0 border-r last:border-r-0 border-white/5">
                   <div className="flex items-center gap-2">
                      <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                      <div className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-40">
                        {s.label}
                      </div>
                   </div>
                   <div className="text-3xl font-display font-bold text-white">{s.value}</div>
                </div>
              ))}
           </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* History Column (3/5) */}
          <div className="lg:col-span-3 space-y-6">
            <div className="flex items-center gap-3">
               <Star className="w-5 h-5 text-cyan" />
               <h3 className="text-lg font-display font-bold text-white uppercase tracking-tight">Recent Activity</h3>
            </div>

            <div>
               {profile.reports.length === 0 ? (
                 <div className="p-12 rounded-2xl border-2 border-dashed border-white/5 text-center text-white/30 text-sm">
                    No activity recorded yet.
                 </div>
               ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   {profile.reports.map((report: any) => (
                    <Link 
                      key={report.id} 
                      href={`/citizen/report/${report.id}`}
                      className="group block rounded-2xl bg-card border border-white/5 hover:bg-white/[0.04] transition-all overflow-hidden"
                    >
                      <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span 
                            className="px-2.5 py-1 rounded-md text-[8px] font-mono font-black uppercase tracking-widest"
                            style={{ 
                              background: report.status === 'RESOLVED' ? 'rgba(196,254,0,0.1)' : 'rgba(255,184,0,0.1)',
                              color: report.status === 'RESOLVED' ? 'var(--accent-lime)' : 'var(--accent-amber)',
                            }}
                          >
                            {report.status}
                          </span>
                          <span className="text-[8px] font-mono uppercase tracking-widest text-white/20">
                            {report.category}
                          </span>
                        </div>
                        <h4 className="font-display font-bold text-base text-white group-hover:text-cyan transition-colors line-clamp-2 uppercase tracking-tight">
                          {report.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[9px] font-mono text-secondary uppercase tracking-widest">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{report.address ? report.address.split(',')[0] : 'GPS Tagged'}</span>
                        </div>
                      </div>
                      <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-white/20">
                          {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-mono text-white/30">+{report._count.votes} votes</span>
                          <span className="text-xs font-display font-bold text-cyan">+25 XP</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                 </div>
               )}
            </div>
          </div>

          {/* Timeline Column (2/5) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-3">
               <History className="w-5 h-5 text-magenta" />
               <h3 className="text-lg font-display font-bold text-white uppercase tracking-tight">Reward Logs</h3>
            </div>

            <div className="relative">
               {/* Vertical line */}
               <div className="absolute left-[24px] top-0 bottom-0 w-px bg-white/5" />

               <div className="space-y-4">
                  {pointLogs.length === 0 ? (
                    <div className="p-10 rounded-3xl bg-card border border-white/5 text-center text-white/30 text-sm">
                       Earn XP by reporting city hazards.
                    </div>
                  ) : (
                    pointLogs.map((log: any) => (
                      <div key={log.id} className="relative grid grid-cols-[48px_1fr_auto] items-center gap-6 group">
                         {/* Bullet Container */}
                         <div className="w-12 h-12 flex items-center justify-center relative z-10">
                           <div 
                             className="w-3.5 h-3.5 rounded-full border-2 border-bg-primary transition-transform group-hover:scale-125"
                             style={{ background: 'var(--accent-cyan)', boxShadow: '0 0 10px var(--accent-cyan)' }}
                           />
                         </div>
                         
                         <div className="space-y-1">
                            <h4 className="font-bold text-sm text-white/90 leading-tight">{log.reason}</h4>
                            <p className="text-[10px] font-mono uppercase tracking-widest text-secondary">
                               {new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {log.report?.category || 'SYSTEM'}
                            </p>
                         </div>

                         <div className="text-right">
                             <span className="text-sm font-display font-bold text-lime">+{log.points} XP</span>
                         </div>
                      </div>
                    ))
                  )}
               </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
