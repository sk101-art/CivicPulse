import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeskQueue } from "@/components/desk/DeskQueue";
import { Band } from "@prisma/client";

export const revalidate = 0;

const BAND_PRIORITY: Record<Band, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export default async function DeskPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'AUTHORITY') {
    redirect('/login');
  }

  const [rawIssues, agencies] = await Promise.all([
    prisma.issue.findMany({
      include: {
        agency: { select: { id: true, code: true, name: true, slaHours: true } },
        _count: { select: { reports: true, comments: true } },
        reports: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { id: true, photoUrl: true, createdAt: true },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.agency.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Sort by PI Band (CRITICAL > HIGH > MEDIUM > LOW) then Priority desc
  const issues = [...rawIssues];
  issues.sort((a, b) => {
    const bandA = BAND_PRIORITY[a.bandOverride || a.band] || 0;
    const bandB = BAND_PRIORITY[b.bandOverride || b.band] || 0;
    if (bandB !== bandA) return bandB - bandA;
    return b.priority - a.priority;
  });

  return (
    <main className="flex-1 overflow-y-auto w-full h-full pb-24 lg:pb-0 bg-primary">
      <AppHeader
        title="Operations Queue"
        subtitle="Shared Desk Command (Desk A & Desk B)"
        accentColor="var(--accent-cyan)"
      />

      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
        <DeskQueue
          initialIssues={JSON.parse(JSON.stringify(issues))}
          agencies={agencies}
        />
      </div>
    </main>
  );
}
