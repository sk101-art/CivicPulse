import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ActiveIssuesList } from "@/components/authority/ActiveIssuesList";
import { KPICard } from "@/components/authority/KPICard";
import { AppHeader } from "@/components/layout/AppHeader";
import { RefreshButton } from "@/components/ui/RefreshButton";

export const revalidate = 0;

export default async function AuthorityDashboard() {
  await getServerSession(authOptions);

  const allIssues = await prisma.issue.findMany({
    include: { _count: { select: { reports: true, comments: true } }, agency: true },
    orderBy: { priority: 'desc' },
  });

  const activeIssues = allIssues.filter(r => !['CLAIMED_FIXED', 'VERIFIED_FIXED', 'REJECTED'].includes(r.status));
  const newReports = activeIssues.filter(r => r.status === 'OPEN');
  const operationalQueue = activeIssues.filter(r => r.status !== 'OPEN');

  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const resolvedIssues = allIssues.filter(r => ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(r.status));

  const activeCount = allIssues.filter(r => ['OPEN', 'CONFIRMED', 'ASSIGNED'].includes(r.status)).length;
  const inProgressCount = allIssues.filter(r => r.status === 'IN_PROGRESS').length;
  const resolvedToday = resolvedIssues.filter(r => r.updatedAt && new Date(r.updatedAt) >= todayStart).length;
  const totalResolved = resolvedIssues.length;

  const mapToIssueItem = (issue: typeof allIssues[number]) => ({
    id: issue.id,
    title: `${issue.category.replace(/_/g, ' ')} at ${issue.address || 'Bengaluru'}`,
    category: issue.category,
    status: issue.status,
    priorityScore: issue.priority,
    slaBreached: issue.slaBreached,
    voteCount: issue._count?.reports || 0,
    commentCount: issue._count?.comments || 0,
    createdAt: issue.createdAt,
    slaHours: issue.agency?.slaHours ?? 72,
    address: issue.address || ''
  });

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0 bg-primary">
      <AppHeader 
        title="Dashboard"
        subtitle="Authority Interface"
        accentColor="var(--accent-electric-blue)"
        actionButton={
          <div className="flex items-center gap-4">
            <RefreshButton />
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-lime/20 bg-lime/5 text-[10px] font-mono uppercase tracking-[0.2em] font-bold text-lime shadow-lg">
              <div className="relative flex items-center justify-center">
                <span className="block w-2 h-2 rounded-full bg-lime" />
                <span className="absolute w-full h-full rounded-full animate-ping opacity-50 bg-lime" />
              </div>
              Node: Active
            </div>
          </div>
        }
      />

      <div className="p-6 md:p-8 space-y-16 max-w-7xl mx-auto">
        {/* KPI Row */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <KPICard label="Active Issues"    value={activeCount}      iconName="AlertTriangle"  accentColor="var(--accent-amber)"          delayMs={0} />
          <KPICard label="In Progress"      value={inProgressCount}  iconName="TrendingUp"     accentColor="var(--accent-electric-blue)"  delayMs={150} />
          <KPICard label="Resolved Today"   value={resolvedToday}    iconName="CheckCircle2"   accentColor="var(--accent-lime)"           delayMs={300} />
          <KPICard label="Total Resolved"   value={totalResolved}    iconName="BarChart3"      accentColor="var(--accent-cyan)"           delayMs={450} />
        </section>

        {/* New Reports Queue */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="font-display font-bold text-xl text-white uppercase tracking-tight">New Reports</h3>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">Awaiting Authority Confirmation</p>
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest px-3 py-1 bg-amber/10 text-amber border border-amber/20 rounded-lg">
              {newReports.length} pending verification
            </div>
          </div>
          
          <ActiveIssuesList issues={newReports.map(mapToIssueItem)} />
        </section>

        {/* Operational Queue */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="font-display font-bold text-xl text-white uppercase tracking-tight">Operational Queue</h3>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">Confirmed & Active Missions</p>
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest px-3 py-1 bg-cyan/10 text-cyan border border-cyan/20 rounded-lg">
              {operationalQueue.length} in progress
            </div>
          </div>
          
          <ActiveIssuesList issues={operationalQueue.map(mapToIssueItem)} />
        </section>
      </div>
    </main>
  );
}
