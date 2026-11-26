import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RouteOptimizerView } from "@/components/desk/RouteOptimizerView";
import { redirect } from "next/navigation";
import { Status } from "@prisma/client";

export const revalidate = 0;

export default async function DeskMapPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "AUTHORITY") {
    redirect("/login/staff");
  }

  const issues = await prisma.issue.findMany({
    where: {
      status: {
        in: [
          Status.OPEN,
          Status.CONFIRMED,
          Status.ASSIGNED,
          Status.IN_PROGRESS,
          Status.DISPUTED,
          Status.REOPENED_IN_WARRANTY,
        ],
      },
    },
    include: {
      agency: { select: { id: true, code: true, name: true } },
      assignments: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { personnel: { select: { id: true, name: true, role: true } } },
      },
    },
    take: 150,
    orderBy: { priority: "desc" },
  });

  const formattedReports = issues.map((i) => ({
    id: i.id,
    latitude: i.lat,
    longitude: i.lng,
    title: `${(i.category || "OTHER").replace(/_/g, " ")} at ${i.address || "Bengaluru"}`,
    status: i.status,
    category: i.category,
    band: i.bandOverride || i.band,
    priorityScore: i.priority,
    address: i.address || undefined,
    wardId: i.wardId || null,
    slaDueAt: i.slaDueAt.toISOString(),
    slaBreached: i.slaBreached,
    agencyName: i.agency?.name || null,
    assignedPersonnel: i.assignments[0]?.personnel
      ? `${i.assignments[0].personnel.name} (${i.assignments[0].personnel.role})`
      : null,
  }));

  return (
    <main className="flex-1 flex flex-col h-full bg-[#F3F2EB] overflow-hidden">
      {/* Editorial Header */}
      <div className="p-5 md:px-8 border-b border-[#DDDCD3] bg-[#FFFFFF] shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider mb-0.5">
              FIELD MOBILITY &amp; INCIDENT LOGISTICS
            </div>
            <h1 className="text-2xl font-display font-bold text-[#293732] tracking-tight">
              Route Optimizer
            </h1>
            <p className="text-xs text-[#65736B] font-sans">
              Urban cartography, road-network visit sequencing, and personnel dispatch planning.
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
