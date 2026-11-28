import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { deskStatusFilter } from "@/lib/desk/queueFilter";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DeskQueue } from "@/components/desk/DeskQueue";
import { LiveDataStatus } from "@/components/desk/LiveDataStatus";
import { Band } from "@prisma/client";

export const revalidate = 0;

const BAND_PRIORITY: Record<Band, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export default async function DeskDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'AUTHORITY') {
    redirect('/login/staff');
  }

  const loadDeskData = async () => {
    return Promise.all([
      prisma.issue.findMany({
        where: { status: deskStatusFilter(null, false) },
        include: {
          agency: { select: { id: true, code: true, name: true, slaHours: true } },
          assignments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { personnel: true },
          },
          _count: { select: { reports: true, comments: true } },
          reports: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              photoUrl: true,
              photoSha256: true,
              gpsAccuracyM: true,
              capturedAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 200,
      }),
      prisma.agency.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.ward.findMany({ 
        where: { isLegacy: false },
        select: { id: true, code: true, name: true },
        orderBy: [{ wardNumber: "asc" }, { code: "asc" }],
      }),
    ]);
  };

  let rawIssues: Awaited<ReturnType<typeof loadDeskData>>[0] = [];
  let agencies: Awaited<ReturnType<typeof loadDeskData>>[1] = [];
  let wards: Awaited<ReturnType<typeof loadDeskData>>[2] = [];
  let deskDataError: string | null = null;
  const [weatherCoverageRows, trafficCoverageRows, profileStatus, jobRunRows] = await Promise.all([
    prisma.$queryRaw<Array<{ latest: Date | null; freshPoints: number; totalPoints: number }>>`
      SELECT COUNT(*)::int AS "totalPoints",
             COUNT(*) FILTER (WHERE "latest" >= NOW() - INTERVAL '3 hours')::int AS "freshPoints",
             MAX("latest") AS "latest"
      FROM (
        SELECT "pointKey", MAX("fetchedAt") AS "latest"
        FROM "WeatherForecast"
        GROUP BY "pointKey"
      ) AS point_freshness
    `.catch(() => null),
    prisma.$queryRaw<Array<{ latest: Date | null; freshPoints: number; totalPoints: number }>>`
      SELECT COUNT(*)::int AS "totalPoints",
             COUNT(*) FILTER (WHERE "latest" >= NOW() - INTERVAL '4 hours')::int AS "freshPoints",
             MAX("latest") AS "latest"
      FROM (
        SELECT COALESCE("issueId", "segmentId") AS "locationKey", MAX("sampledAt") AS "latest"
        FROM "TrafficSample"
        WHERE "isSeed" = false AND COALESCE("issueId", "segmentId") IS NOT NULL
        GROUP BY COALESCE("issueId", "segmentId")
      ) AS location_freshness
    `.catch(() => null),
    prisma.placeTrafficProfile.aggregate({ _max: { fetchedAt: true } }).catch(() => null),
    prisma.scheduledJobRun.findMany({
      where: { job: { in: ["weather", "traffic-sample", "traffic-profile"] } },
      orderBy: { startedAt: "desc" },
      distinct: ["job"],
    }).catch(() => null),
  ]);
  const latestJobRuns = new Map((jobRunRows ?? []).map((run) => [run.job, run]));

  try {
    [rawIssues, agencies, wards] = await loadDeskData();
  } catch (err) {
    console.warn("Desk query initial attempt failed, retrying:", err);
    try {
      [rawIssues, agencies, wards] = await loadDeskData();
    } catch (e) {
      console.error("Failed to load desk data:", e);
      deskDataError = "The operations queue could not be loaded. Retrying from the live queue service.";
    }
  }

  // Sort by Band then Priority
  const issues = [...rawIssues].sort((a, b) => {
    const bandA = BAND_PRIORITY[a.bandOverride || a.band] || 0;
    const bandB = BAND_PRIORITY[b.bandOverride || b.band] || 0;
    if (bandB !== bandA) return bandB - bandA;
    return b.priority - a.priority;
  });

  return (
    <main className="flex-1 w-full pb-24 lg:pb-8 bg-[#F3F2EB]">
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Editorial Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#DDDCD3] pb-5">
          <div>
            <div className="text-[11px] font-mono font-bold text-[#527B7A] uppercase tracking-wider mb-1">
              OPERATIONS DISPATCH & ACTION LEDGER
            </div>
            <h1 className="text-3xl font-display font-bold text-[#293732] tracking-tight">
              Operations Queue
            </h1>
            <p className="text-xs text-[#65736B] font-sans mt-1">
              Manage, assign, prioritize and coordinate civic field work across municipal jurisdictions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-3 py-1.5 rounded-xl bg-[#E5E9E3] border border-[#DDDCD3] text-[#355858]">
              {issues.length} Issues Loaded
            </span>
          </div>
        </div>

        <LiveDataStatus
          weatherCoverage={weatherCoverageRows?.[0] ?? null}
          trafficCoverage={trafficCoverageRows?.[0] ?? null}
          latestTrafficProfile={profileStatus?._max.fetchedAt ?? null}
          latestWeatherRun={latestJobRuns.get("weather") ?? null}
          latestTrafficRun={latestJobRuns.get("traffic-sample") ?? null}
          latestTrafficProfileRun={latestJobRuns.get("traffic-profile") ?? null}
        />

        {/* Desk Queue Component with 4 Stat Cards, Filters, and Swiss-grid Table */}
        <DeskQueue
          initialIssues={JSON.parse(JSON.stringify(issues))}
          agencies={agencies}
          wards={wards}
          initialLoadError={deskDataError}
        />
      </div>
    </main>
  );
}
