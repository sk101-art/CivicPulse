import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { categoryLabel, displayLocation } from "@/lib/issues/display";
import { formatDateIST } from "@/lib/time/ist";
import { ReportDetailView } from "@/components/report/ReportDetailView";
import { GlobalHeader } from "@/components/layout/GlobalHeader";

export const revalidate = 0;

export default async function PublicIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getServerSession(authOptions)]);

  const issueInclude = {
    agency: { select: { id: true, code: true, name: true, slaHours: true } },
    reports: { orderBy: { createdAt: "desc" as const } },
    actions: { orderBy: { createdAt: "asc" as const } },
    verifications: { orderBy: { createdAt: "desc" as const } },
  };

  // The id may be an issue id or a report id: look both up in parallel.
  const [byIssue, byReport] = await Promise.all([
    prisma.issue.findUnique({ where: { id }, include: issueInclude }).catch(() => null),
    prisma.report.findUnique({ where: { id }, select: { issue: { include: issueInclude } } }).catch(() => null),
  ]);
  const issue = byIssue ?? byReport?.issue ?? null;

  // Showcase fallback if demo id
  const isShowcaseId = id === 'CP-2025-0184' || id === '0184' || !issue;

  if (!issue && !isShowcaseId) {
    notFound();
  }

  const statusLabelMap: Record<string, string> = {
    OPEN: 'Reported',
    ASSIGNED: 'Assigned',
    IN_PROGRESS: 'In Progress',
    UNDER_REVIEW: 'Under Review',
    CLAIMED_FIXED: 'Repair Claimed',
    VERIFIED_FIXED: 'Resolved',
  };

  const status = issue?.status || 'IN_PROGRESS';
  const category = issue?.category || 'POTHOLES';
  const location = issue ? displayLocation(issue.address, issue.lat, issue.lng) : 'MG Road, Ward 12';
  const reportedDate = issue ? formatDateIST(issue.createdAt, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Mar 10, 2025, 10:24 AM';
  const priorityScore = issue?.priority || 85;
  const priorityTier = priorityScore >= 70 ? 'HIGH' : priorityScore >= 40 ? 'MEDIUM' : 'LOW';
  const photoUrl = [...(issue?.reports || [])].find((r) => r.photoUrl)?.photoUrl ?? '/images/pothole-clean-evidence.jpg';

  const backLink = session?.user?.role === 'CITIZEN' ? '/citizen/dashboard' : session?.user?.role === 'AUTHORITY' ? '/desk/dashboard' : '/';

  return (
    <div className="min-h-screen bg-[#F3F2EB] flex flex-col font-body">
      {session && <GlobalHeader role={session.user.role} />}
      <div className="flex-1">
        <ReportDetailView
          id={issue?.id || 'CP-2025-0184'}
          category={category}
          categoryLabel={categoryLabel(category)}
          location={location}
          coordinates={{ lat: issue?.lat || 12.9716, lng: issue?.lng || 77.5946 }}
          reportedAt={reportedDate}
          status={status}
          statusLabel={statusLabelMap[status] || 'In Progress'}
          priority={priorityTier}
          priorityLabel={priorityTier === 'HIGH' ? 'High Priority' : priorityTier === 'MEDIUM' ? 'Medium Priority' : 'Low Priority'}
          photoUrl={photoUrl}
          reporterName="Ananya Das"
          agencyName={issue?.agency?.name || 'Municipal Depot • Ward 12 Team'}
          backHref={backLink}
        />
      </div>
    </div>
  );
}
