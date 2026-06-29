import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MapDashboardWrapper } from "@/components/authority/MapDashboardWrapper";
import { AppHeader } from "@/components/layout/AppHeader";


import { redirect } from "next/navigation";

export const revalidate = 0;

export default async function AuthorityMapPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || (session.user as any).role !== 'AUTHORITY') {
    redirect('/login');
  }

  const userId = (session?.user as any)?.id;
  const userWithDept = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });

  // Removed department restriction block to allow all authority users to see map

  const rawReports = await prisma.report.findMany({
    orderBy: { priorityScore: 'desc' },
  });

  const allReports = rawReports;

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0 bg-primary flex flex-col">
      <AppHeader 
        title="Map View"
        subtitle="Geospatial Analysis • Hazard Routing"
        accentColor="var(--accent-electric-blue)"
        actionButton={
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'ZONE: S-12', color: 'var(--accent-electric-blue)' },
              { label: '⬤ DEPLOYMENT', color: 'var(--accent-lime)' },
              { label: '⬤ OBJECTIVE', color: 'var(--accent-magenta)' },
            ].map(b => (
              <span
                key={b.label}
                className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold shadow-sm border border-white/5 bg-white/5"
                style={{ color: b.color }}
              >
                {b.label}
              </span>
            ))}
          </div>
        }
      />

      {/* Spacious Map Container */}
      <div className="flex-1 p-6 lg:p-8">
        <div className="rounded-[2rem] p-6 lg:p-8 h-full flex flex-col relative shadow-2xl bg-card border border-white/5 min-h-[600px]">
          {/* Instruction panel */}
          <div
            className="mb-8 px-8 py-6 rounded-[1.5rem] text-sm leading-relaxed shrink-0 shadow-inner"
            style={{
              background: 'rgba(0,212,255,0.03)',
              border: '1px solid rgba(0,212,255,0.08)',
              color: 'var(--text-secondary)',
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-electric-blue)' }} />
              <span className="text-[10px] font-mono uppercase tracking-widest font-black" style={{ color: 'var(--accent-electric-blue)' }}>Operational Directives</span>
            </div>
            <p className="text-base">
              Establish <span style={{ color: 'var(--accent-lime)', fontWeight: 800 }}>Primary Origin</span> &amp; <span style={{ color: 'var(--accent-magenta)', fontWeight: 800 }}>Target Destination</span>.
              The OSRM engine will calculate optimal deployment paths while maintaining a 150m buffer from identified 
              <span style={{ color: 'var(--accent-amber)', fontWeight: 800 }}> Civic Hazards</span>.
            </p>
          </div>

          <div className="flex-1 rounded-[3rem] overflow-hidden shadow-2xl border border-white/5" style={{ minHeight: '650px' }}>
            <MapDashboardWrapper
              reports={allReports.map((i: any) => ({
                id: i.id,
                latitude: i.latitude,
                longitude: i.longitude,
                title: i.title,
                status: i.status,
                category: i.category,
                priorityScore: i.priorityScore,
              }))}
              showReportButton={true}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
