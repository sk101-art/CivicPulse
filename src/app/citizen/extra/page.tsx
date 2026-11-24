import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { issueTitle } from '@/lib/issues/display';
import { latestReportPerIssue } from '@/lib/citizen/statsPure';
import { ReportLocationsView, type LocationRecord } from '@/components/citizen/ReportLocationsView';

export const revalidate = 0;

export default async function ExtraFeaturePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const userId = session.user.id;

  // Fetch wards for fast in-memory code & name lookup
  const wards = await prisma.ward.findMany({
    select: { id: true, code: true, name: true }
  });
  const wardMap = new Map(wards.map(w => [w.id, w]));

  // 1. Fetch user's submitted reports with issue coordinate data
  const rawReports = await prisma.report.findMany({
    where: { userId, role: { in: ['REPORT', 'CONFIRM'] } },
    select: {
      id: true,
      issueId: true,
      lat: true,
      lng: true,
      createdAt: true,
      issue: {
        select: {
          id: true,
          category: true,
          status: true,
          address: true,
          wardId: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const userReports: LocationRecord[] = latestReportPerIssue(rawReports)
    .slice(0, 100)
    .map((r) => {
      const ward = r.issue.wardId ? wardMap.get(r.issue.wardId) : null;
      return {
        id: r.id,
        issueId: r.issueId,
        title: issueTitle(r.issue.category, r.issue.address, r.lat, r.lng),
        category: r.issue.category,
        status: r.issue.status,
        latitude: r.lat,
        longitude: r.lng,
        address: r.issue.address,
        wardName: ward?.name || null,
        wardCode: ward?.code || null,
        createdAt: r.createdAt.toISOString(),
        isUserSubmission: true,
      };
    });

  // 2. Fetch area issues across the city / wards with coordinates
  const rawIssues = await prisma.issue.findMany({
    select: {
      id: true,
      category: true,
      status: true,
      lat: true,
      lng: true,
      address: true,
      createdAt: true,
      wardId: true,
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });

  const areaIssues: LocationRecord[] = rawIssues.map((iss) => {
    const ward = iss.wardId ? wardMap.get(iss.wardId) : null;
    return {
      id: iss.id,
      issueId: iss.id,
      title: issueTitle(iss.category, iss.address, iss.lat, iss.lng),
      category: iss.category,
      status: iss.status,
      latitude: iss.lat,
      longitude: iss.lng,
      address: iss.address,
      wardName: ward?.name || null,
      wardCode: ward?.code || null,
      createdAt: iss.createdAt.toISOString(),
      isUserSubmission: false,
    };
  });

  return (
    <div className="flex-1 w-full pb-24 lg:pb-12 bg-[#F3F2EB]">
      <ReportLocationsView
        initialUserReports={userReports}
        initialAreaIssues={areaIssues}
      />
    </div>
  );
}
