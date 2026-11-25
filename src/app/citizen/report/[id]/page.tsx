import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { EvidenceRole } from "@prisma/client";
import { formatDateIST } from "@/lib/time/ist";
import { categoryLabel, displayLocation } from "@/lib/issues/display";
import { buildIssueTimelineAndDetails } from "@/lib/issues/timeline";
import { ReportDetailView } from "@/components/report/ReportDetailView";

const issueInclude = {
  agency: { select: { id: true, code: true, name: true, slaHours: true } },
  reports: { orderBy: { createdAt: 'asc' as const } },
  actions: { orderBy: { createdAt: 'asc' as const } },
  verifications: { orderBy: { createdAt: 'desc' as const } },
  auditTasks: { include: { votes: { orderBy: { createdAt: 'desc' as const } } } },
  assignments: { include: { personnel: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
  _count: { select: { comments: true } },
};

export const revalidate = 0;

export default async function ReportDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getServerSession(authOptions)]);
  if (!session) redirect('/login');

  // The id may be an issue id or (older links) a report id: look both up in parallel.
  const [byIssue, byReport] = await Promise.all([
    prisma.issue.findUnique({ where: { id }, include: issueInclude }).catch(() => null),
    prisma.report.findUnique({ where: { id }, select: { issue: { include: issueInclude } } }).catch(() => null),
  ]);
  const issue = byIssue ?? byReport?.issue ?? null;

  if (!issue) {
    notFound();
  }

  const primaryReport = issue.reports.find((r) => r.role === EvidenceRole.REPORT) ?? issue.reports[0] ?? null;
  const photoUrl = [...issue.reports].reverse().find((r) => r.photoUrl)?.photoUrl ?? '/images/pothole-clean-evidence.jpg';

  const reporterUser = primaryReport
    ? await prisma.user.findUnique({ where: { id: primaryReport.userId }, select: { name: true } }).catch(() => null)
    : null;
  const reporterName = reporterUser?.name || 'Citizen Contributor';

  const statusLabelMap: Record<string, string> = {
    OPEN: 'Reported',
    CONFIRMED: 'Confirmed',
    ASSIGNED: 'Assigned',
    IN_PROGRESS: 'In Progress',
    CLAIMED_FIXED: 'Repair Claimed',
    VERIFIED_FIXED: 'Verified Fixed',
    DISPUTED: 'Disputed',
    REJECTED: 'Rejected',
  };

  const status = issue.status;
  const category = issue.category;
  const location = displayLocation(issue.address, issue.lat, issue.lng);
  const reportedDate = formatDateIST(issue.createdAt, { month: 'short', day: 'numeric', year: 'numeric' });
  const priorityScore = issue.priority;
  const priorityTier = priorityScore >= 70 ? 'HIGH' : priorityScore >= 40 ? 'MEDIUM' : 'LOW';
  const details = buildIssueTimelineAndDetails(issue, reporterName);

  return (
    <ReportDetailView
      id={issue.id}
      category={category}
      categoryLabel={categoryLabel(category)}
      location={location}
      coordinates={{ lat: issue.lat, lng: issue.lng }}
      reportedAt={reportedDate}
      status={status}
      statusLabel={statusLabelMap[status] || status.replace(/_/g, ' ')}
      priority={priorityTier}
      priorityLabel={priorityTier === 'HIGH' ? 'High Priority' : priorityTier === 'MEDIUM' ? 'Medium Priority' : 'Low Priority'}
      photoUrl={photoUrl}
      reporterName={reporterName}
      agencyName={issue.agency?.name || issue.assignments[0]?.personnel?.name || 'Municipal Operations Desk'}
      notes={details.notes}
      photoSha256={details.photoSha256}
      signature={details.signature}
      gpsAccuracyM={details.gpsAccuracyM}
      timelineSteps={details.timelineSteps}
      auditLogs={details.auditLogs}
      verifications={details.verifications}
      backHref="/citizen/dashboard"
    />
  );
}
