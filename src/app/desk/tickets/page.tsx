import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ActiveIssuesList } from "@/components/authority/ActiveIssuesList";
import { TicketFilters } from "@/components/authority/TicketFilters";
import { AppHeader } from "@/components/layout/AppHeader";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function DeskTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ 
    sort?: string; 
    search?: string; 
    status?: string; 
    category?: string 
  }>;
}) {
  const { sort = 'latest', search = '', status = '', category = '' } = await searchParams;
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'AUTHORITY') {
    redirect('/login');
  }

  const where: Prisma.IssueWhereInput = {};

  if (search) {
    where.OR = [
      { address: { contains: search, mode: 'insensitive' } },
      { piText: { contains: search, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.IssueOrderByWithRelationInput =
    sort === 'priority' ? { priority: 'desc' } : { createdAt: 'desc' };

  const rawIssues = await prisma.issue.findMany({
    where,
    include: { _count: { select: { reports: true, comments: true } }, agency: true },
    orderBy,
  });

  let displayReports = [...rawIssues];
  if (status) {
    displayReports = displayReports.filter(r => r.status === status);
  }
  if (category) {
    displayReports = displayReports.filter(r => r.category === category);
  }

  const mapToIssueItem = (issue: typeof rawIssues[number]) => ({
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
        title="Active Tickets"
        subtitle="Operational Ticket Directory"
        accentColor="var(--accent-electric-blue)"
        actionButton={<RefreshButton />}
      />

      <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
        <TicketFilters />
        <ActiveIssuesList issues={displayReports.map(mapToIssueItem)} />
      </div>
    </main>
  );
}
