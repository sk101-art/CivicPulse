import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MapDashboardWrapper } from "@/components/authority/MapDashboardWrapper";
import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function DeskMapPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'AUTHORITY') {
    redirect('/login');
  }

  const issues = await prisma.issue.findMany({
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
  }));

  return (
    <main className="flex-1 flex flex-col h-full bg-[#F3F2EB] overflow-hidden">
      {/* Editorial Header (Row 4, Col 2) */}
      <div className="p-6 md:px-8 border-b border-[#DDDCD3] bg-[#FFFFFF] shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-[#293732] tracking-tight">
              Route Optimizer
            </h1>
            <p className="text-xs text-[#65736B] font-sans mt-0.5">
              Urban cartography and logistics dispatch routing.
            </p>
          </div>
          <span className="text-xs font-mono text-[#527B7A] bg-[#E9ECE6] px-3 py-1 rounded-xl border border-[#DDDCD3]">
            Municipal Grid Active
          </span>
        </div>
      </div>

      <div className="flex-1 relative w-full h-[calc(100vh-140px)] p-4 md:p-6">
        <div className="h-full w-full rounded-2xl overflow-hidden border border-[#DDDCD3] shadow-[0_8px_30px_rgba(41,55,50,0.06)] bg-[#FFFFFF]">
          <MapDashboardWrapper reports={formattedReports} />
        </div>
      </div>
    </main>
  );
}
