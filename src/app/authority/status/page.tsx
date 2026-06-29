import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusTimeline } from "@/components/authority/StatusTimeline";
import { redirect } from "next/navigation";
import { RefreshButton } from "@/components/ui/RefreshButton";

export const revalidate = 0;

export default async function AuthorityStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = '' } = await searchParams;
  const session = await getServerSession(authOptions);
  
  if (!session || (session.user as any).role !== 'AUTHORITY') {
    redirect('/login');
  }

  const userId = (session?.user as any)?.id;
  const userWithDept = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });

  if (!userWithDept?.departmentId) {
    return (
      <main className="flex-1 p-10 bg-primary text-white">
        <h1 className="text-2xl font-display mb-4">Access Restricted</h1>
        <p className="text-text-secondary font-body">Your account is not assigned to any department.</p>
      </main>
    );
  }

  const deptId = userWithDept.departmentId;

  // Fetch all reports (removed department filter for global sync)
  const allReports = await prisma.report.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  // Apply filter in JS
  const reports = (filter && filter !== 'ALL')
    ? allReports.filter(r => r.status === filter)
    : allReports;

  // Compute counts in JS
  const total = allReports.length;
  const open = allReports.filter(r => r.status === 'OPEN').length;
  const confirmed = allReports.filter(r => r.status === 'CONFIRMED').length;
  const assigned = allReports.filter(r => r.status === 'ASSIGNED').length;
  const inProgress = allReports.filter(r => r.status === 'IN_PROGRESS').length;
  const resolved = allReports.filter(r => r.status === 'RESOLVED').length;

  const serializedReports = reports.slice(0, 50).map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString() || null,
    assignedAt: r.assignedAt?.toISOString() || null,
    startedAt: r.startedAt?.toISOString() || null,
    resolvedAt: r.resolvedAt?.toISOString() || null,
    rejectedAt: r.rejectedAt?.toISOString() || null,
    address: r.address || '',
    priorityScore: r.priorityScore,
  }));

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0 bg-primary flex flex-col">
      <AppHeader 
        title="Operations Status"
        subtitle="Live Lifecycle Monitoring"
        accentColor="var(--accent-electric-blue)"
        actionButton={<RefreshButton />}
      />

      <div className="p-6 lg:p-8 space-y-10 max-w-7xl mx-auto w-full">
        <StatusTimeline 
          reports={serializedReports}
          currentFilter={filter || 'ALL'}
          counts={{ total, open, confirmed, assigned, inProgress, resolved }}
        />
      </div>
    </main>
  );
}
