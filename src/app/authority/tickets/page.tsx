import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ActiveIssuesList } from "@/components/authority/ActiveIssuesList";
import { TicketFilters } from "@/components/authority/TicketFilters";
import { AppHeader } from "@/components/layout/AppHeader";
import { Suspense } from "react";
import { Loader2, Search, ShieldAlert } from "lucide-react";
import { RefreshButton } from "@/components/ui/RefreshButton";

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
  
  const userId = (session?.user as any)?.id;
  const userWithDept = await prisma.user.findUnique({
    where: { id: userId },
    include: { department: true },
  });

  // Redirect non-authority users to login immediately
  if (!session || (session.user as any)?.role !== 'AUTHORITY') {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }

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
               href="/login"
               className="block text-center w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-mono font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-all"
             >
               Return to Login
             </a>
          </div>
        </div>
      </main>
    );
  }

  const deptId = userWithDept.departmentId;

  // Build where clause — keep search in Prisma, but filter enum fields in JS to avoid PrismaPg adapter issues
  let where: any = { departmentId: deptId };

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Sorting
  let orderBy: any = { createdAt: 'desc' };
  if (sort === 'priority') orderBy = { priorityScore: 'desc' };
  if (sort === 'latest') orderBy = { createdAt: 'desc' };

  const rawReports = await prisma.report.findMany({
    where,
    include: { _count: { select: { votes: true, comments: true } } },
    orderBy,
  });

  // Apply enum filters in JS
  let displayReports = [...rawReports];
  if (status) {
    displayReports = displayReports.filter(r => r.status === status);
  }
  if (category) {
    displayReports = displayReports.filter(r => r.category === category);
  }
  if (sort === 'votes') {
    displayReports.sort((a: any, b: any) => (b._count?.votes || 0) - (a._count?.votes || 0));
  } else if (sort === 'comments') {
    displayReports.sort((a: any, b: any) => (b._count?.comments || 0) - (a._count?.comments || 0));
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
