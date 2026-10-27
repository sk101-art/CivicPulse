import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ActiveIssuesList } from "@/components/authority/ActiveIssuesList";
import { TicketFilters } from "@/components/authority/TicketFilters";
import { AppHeader } from "@/components/layout/AppHeader";
import { Suspense } from "react";
import { Loader2, Search } from "lucide-react";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function AuthorityTicketsPage({
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

  // Sorting
  const orderBy: Prisma.IssueOrderByWithRelationInput =
    sort === 'priority' ? { priority: 'desc' } : { createdAt: 'desc' };

  const rawIssues = await prisma.issue.findMany({
    where,
    include: { _count: { select: { reports: true, comments: true } }, agency: true },
    orderBy,
  });

  // Apply enum filters in JS
  let displayReports = [...rawIssues];
  if (status) {
    displayReports = displayReports.filter(r => r.status === status);
  }
  if (category) {
    displayReports = displayReports.filter(r => r.category === category);
  }
  if (sort === 'votes') {
    displayReports.sort((a, b) => (b._count?.reports || 0) - (a._count?.reports || 0));
  } else if (sort === 'comments') {
    displayReports.sort((a, b) => (b._count?.comments || 0) - (a._count?.comments || 0));
  }

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0 bg-primary">
      <AppHeader 
        title="Active Tickets"
        subtitle="Inquiry Management"
        accentColor="var(--accent-electric-blue)"
        actionButton={<RefreshButton />}
      />

      <div className="p-6 md:p-8 space-y-10 max-w-7xl mx-auto">
        <Suspense fallback={<div className="h-20 w-full bg-white/5 animate-pulse rounded-2xl" />}>
          <TicketFilters />
        </Suspense>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-xl text-white uppercase tracking-tight">
              Ticket Repository
            </h3>
            <div className="text-[10px] font-mono uppercase tracking-widest opacity-40">
              {displayReports.length} Entries Located
            </div>
          </div>
          
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-20 text-white/20 gap-4">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-[10px] font-mono uppercase tracking-widest">Querying Secure Database...</span>
            </div>
          }>
            <ActiveIssuesList issues={displayReports.map(r => ({
              id: r.id,
              title: `${r.category.replace(/_/g, ' ')} at ${r.address || 'Bengaluru'}`,
              category: r.category,
              status: r.status,
              priorityScore: r.priority,
              slaBreached: r.slaBreached,
              voteCount: r._count?.reports || 0,
              commentCount: r._count?.comments || 0,
              createdAt: r.createdAt,
              slaHours: r.agency?.slaHours ?? 72,
              address: r.address || ''
            }))} />

            {displayReports.length === 0 && (
              <div className="py-32 flex flex-col items-center justify-center text-center border-2 border-dashed border-white/5 rounded-[3rem] bg-white/[0.01]">
                 <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-6">
                    <Search className="w-6 h-6 text-white/20" />
                 </div>
                 <h4 className="text-xl font-display font-bold text-white/40 uppercase tracking-tight">No Tickets Match Criteria</h4>
                 <p className="text-sm text-white/20 mt-2">Adjust your filters or synchronization settings.</p>
              </div>
            )}
          </Suspense>
        </section>
      </div>
    </main>
  );
}
