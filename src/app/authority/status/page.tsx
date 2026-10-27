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
  
  if (!session || session.user.role !== 'AUTHORITY') {
    redirect('/login');
  }

  // Fetch all issues
  const allIssues = await prisma.issue.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  // Apply filter in JS
  const issues = (filter && filter !== 'ALL')
    ? (filter === 'RESOLVED' 
        ? allIssues.filter(r => ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(r.status))
        : allIssues.filter(r => r.status === filter))
    : allIssues;

  // Compute counts in JS
  const total = allIssues.length;
  const open = allIssues.filter(r => r.status === 'OPEN').length;
  const confirmed = allIssues.filter(r => r.status === 'CONFIRMED').length;
  const assigned = allIssues.filter(r => r.status === 'ASSIGNED').length;
  const inProgress = allIssues.filter(r => r.status === 'IN_PROGRESS').length;
  const resolved = allIssues.filter(r => ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(r.status)).length;

  const serializedReports = issues.slice(0, 50).map(r => ({
    id: r.id,
    title: `${r.category.replace(/_/g, ' ')} at ${r.address || 'Bengaluru'}`,
    category: r.category,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    confirmedAt: null,
    assignedAt: null,
    startedAt: null,
    resolvedAt: ['CLAIMED_FIXED', 'VERIFIED_FIXED'].includes(r.status) ? r.updatedAt.toISOString() : null,
    rejectedAt: r.status === 'REJECTED' ? r.updatedAt.toISOString() : null,
    address: r.address || '',
    priorityScore: r.priority,
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
