import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RouteOptimizerView } from "@/components/desk/RouteOptimizerView";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function DeskMapPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'AUTHORITY') {
    redirect('/login/staff');
  }

  const issues = await prisma.issue.findMany({
    where: {
      status: { in: ['OPEN', 'IN_PROGRESS', 'CONFIRMED', 'ASSIGNED'] }
    },
    take: 100,
    orderBy: { priority: 'desc' },
  });

  const formattedReports = issues.map((i) => ({
    id: i.id,
    latitude: i.lat,
    longitude: i.lng,
    title: `${(i.category || 'OTHER').replace(/_/g, ' ')} at ${i.address || 'Bengaluru'}`,
    status: i.status,
    category: i.category,
    priorityScore: i.priority,
    address: i.address || undefined,
  }));

  return (
    <main className="flex-1 flex flex-col h-full bg-[#F3F2EB] overflow-hidden">
      {/* Editorial Header */}
      <div className="p-5 md:px-8 border-b border-[#DDDCD3] bg-[#FFFFFF] shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider mb-0.5">
              FIELD MOBILITY & INCIDENT LOGISTICS
            </div>
            <h1 className="text-2xl font-display font-bold text-[#293732] tracking-tight">
              Route Optimizer
            </h1>
            <p className="text-xs text-[#65736B] font-sans">
              Urban cartography, defect clustering, and personnel dispatch itinerary planning.
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-[#527B7A] bg-[#E9ECE6] px-3.5 py-1.5 rounded-xl border border-[#DDDCD3] shadow-sm">
            Municipal Grid Active
          </span>
        </div>
      </div>

      <div className="flex-1 relative w-full h-[calc(100vh-140px)] overflow-hidden">
        <RouteOptimizerView initialReports={formattedReports} />
      </div>
    </main>
  );
}
