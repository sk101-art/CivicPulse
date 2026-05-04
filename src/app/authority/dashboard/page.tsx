import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ActiveIssuesList } from "@/components/authority/ActiveIssuesList";
import { KPICard } from "@/components/authority/KPICard";
import { AppHeader } from "@/components/layout/AppHeader";
import { ShieldAlert } from "lucide-react";

export const revalidate = 0;

export default async function AuthorityDashboard() {
  const session = await getServerSession(authOptions);
  
  const userId = (session?.user as any)?.id;
  const userWithDept = await prisma.user.findUnique({
    where: { id: userId },
    include: { department: true },
  });

  if (!userWithDept?.departmentId) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-primary text-white p-6">
        <div className="max-w-md text-center space-y-6 p-10 rounded-[2.5rem] bg-card border border-white/5 shadow-2xl">
          <div className="w-16 h-16 bg-magenta/10 text-magenta rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-display font-bold uppercase tracking-tight">Access Restricted</h1>
            <p className="text-xs font-mono uppercase tracking-widest text-white/40 leading-relaxed">
              Account ID: {userId}<br/>
              Status: UNASSIGNED_NODE
            </p>
          </div>
          <p className="text-sm text-white/60 leading-relaxed">
            This administrative terminal is restricted to departmental personnel. 
            Your account is currently not indexed within any active municipal department.
          </p>
          <div className="pt-4">
             <a 
               href="/"
               className="block text-center w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-mono font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-all"
             >
               Return to Entry Point
             </a>
          </div>
        </div>
      </main>
    );
  }

  const deptId = userWithDept.departmentId;

  // Fetch all department reports to avoid PrismaPg enum adapter issues
  const allDeptReports = await prisma.report.findMany({
    where: { departmentId: deptId },
    include: { _count: { select: { votes: true, comments: true } } },
    orderBy: { priorityScore: 'desc' },
  });

  const reports = allDeptReports.filter(r => r.status !== 'RESOLVED');
  const newReports = reports.filter(r => r.status === 'OPEN');
  const operationalQueue = reports.filter(r => r.status !== 'OPEN');

  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const resolvedReports = allDeptReports.filter(r => r.status === 'RESOLVED');

  const activeCount = allDeptReports.filter(r => ['OPEN', 'CONFIRMED', 'ASSIGNED'].includes(r.status)).length;
  const inProgressCount = allDeptReports.filter(r => r.status === 'IN_PROGRESS').length;
  const resolvedToday = resolvedReports.filter(r => r.resolvedAt && new Date(r.resolvedAt) >= todayStart).length;
  const totalResolved = resolvedReports.length;

  const mapToIssueItem = (r: any) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    status: r.status,
    priorityScore: r.priorityScore,
    slaBreached: r.slaBreached,
    voteCount: r._count?.votes || 0,
    commentCount: r._count?.comments || 0,
    createdAt: r.createdAt,
    slaHours: userWithDept!.department!.slaHours,
    address: r.address || ''
  });

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0 bg-primary">
      <AppHeader 
        title="Dashboard"
        subtitle="Authority Interface"
        accentColor="var(--accent-electric-blue)"
        actionButton={
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-lime/20 bg-lime/5 text-[10px] font-mono uppercase tracking-[0.2em] font-bold text-lime shadow-lg">
            <div className="relative flex items-center justify-center">
              <span className="block w-2 h-2 rounded-full bg-lime" />
              <span className="absolute w-full h-full rounded-full animate-ping opacity-50 bg-lime" />
            </div>
            Node: Active
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
