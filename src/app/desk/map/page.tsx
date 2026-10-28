import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/AppHeader";
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
    title: `${i.category.replace(/_/g, ' ')} at ${i.address || 'Bengaluru'}`,
    status: i.status,
    category: i.category,
    priorityScore: i.priority,
  }));

  return (
    <main className="flex-1 flex flex-col h-full bg-primary overflow-hidden">
      <AppHeader 
        title="Route Optimizer"
        subtitle="Geographic Routing Grid"
        accentColor="var(--accent-electric-blue)"
      />

      <div className="flex-1 relative w-full h-[calc(100vh-80px)]">
        <MapDashboardWrapper reports={formattedReports} />
      </div>
    </main>
  );
}
