import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeskQueue } from "@/components/desk/DeskQueue";
import { DeskMetricsBar } from "@/components/desk/DeskMetricsBar";
import { DeskAnalystPanel } from "@/components/desk/DeskAnalystPanel";
import { Band, Status } from "@prisma/client";

export const revalidate = 0;

function calculateMedian(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

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

  const loadDeskData = async () => {
    return Promise.all([
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
  };

  let rawIssues: Awaited<ReturnType<typeof loadDeskData>>[0];
  let agencies: Awaited<ReturnType<typeof loadDeskData>>[1];
  let reopenedCount = 0;
  let issuesWithLifespan: Array<{ lifespanDays: number | null; wardId: string | null; contractorName: string | null }> = [];
  let allWards: Array<{ id: string; name: string }> = [];

  try {
    [[rawIssues, agencies], reopenedCount, issuesWithLifespan, allWards] = await Promise.all([
      loadDeskData(),
      prisma.issue.count({ where: { status: Status.REOPENED_IN_WARRANTY } }),
      prisma.issue.findMany({
        where: { lifespanDays: { not: null } },
        select: { lifespanDays: true, wardId: true, contractorName: true },
      }),
      prisma.ward.findMany({ select: { id: true, name: true } }),
    ]);
  } catch (err) {
    console.warn("Desk query initial attempt failed, retrying with fresh connection:", err);
    [rawIssues, agencies] = await loadDeskData();
  }

  // Calculate lifespan metrics
  const allLifespans = issuesWithLifespan
    .map((i) => i.lifespanDays)
    .filter((d): d is number => d !== null && d !== undefined);
  const overallLifespanDays = calculateMedian(allLifespans);

  // By ward
  const wardNameMap = new Map(allWards.map((w) => [w.id, w.name]));
  const wardGroups = new Map<string, number[]>();
  for (const item of issuesWithLifespan) {
    if (item.wardId && item.lifespanDays !== null) {
      const wardName = wardNameMap.get(item.wardId) || item.wardId;
      if (!wardGroups.has(wardName)) wardGroups.set(wardName, []);
      wardGroups.get(wardName)!.push(item.lifespanDays);
    }
  }
  const wardLifespans = Array.from(wardGroups.entries())
    .map(([name, days]) => ({ name, medianDays: calculateMedian(days) ?? 0 }))
    .sort((a, b) => a.medianDays - b.medianDays);

  // By contractor
  const contractorGroups = new Map<string, number[]>();
  for (const item of issuesWithLifespan) {
    if (item.contractorName && item.lifespanDays !== null) {
      if (!contractorGroups.has(item.contractorName)) contractorGroups.set(item.contractorName, []);
      contractorGroups.get(item.contractorName)!.push(item.lifespanDays);
    }
  }
  const contractorLifespans = Array.from(contractorGroups.entries())
    .map(([name, days]) => ({ name, medianDays: calculateMedian(days) ?? 0 }))
    .sort((a, b) => a.medianDays - b.medianDays);

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
        <DeskMetricsBar
          reopenedCount={reopenedCount}
          overallLifespanDays={overallLifespanDays}
          wardLifespans={wardLifespans}
          contractorLifespans={contractorLifespans}
        />

        <DeskAnalystPanel />

        <DeskQueue
          initialIssues={JSON.parse(JSON.stringify(issues))}
          agencies={agencies}
        />
      </div>
    </main>
  );
}
