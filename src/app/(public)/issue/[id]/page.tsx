import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { EvidenceRole } from "@prisma/client";
import { categoryLabel, displayLocation } from "@/lib/issues/display";
import { buildIssueTimelineAndDetails } from "@/lib/issues/timeline";
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
    reports: { orderBy: { createdAt: "asc" as const } },
    actions: { orderBy: { createdAt: "asc" as const } },
    verifications: { orderBy: { createdAt: "desc" as const } },
    auditTasks: { include: { votes: { orderBy: { createdAt: "desc" as const } } } },
    assignments: { include: { personnel: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
  };

  // The id may be an issue id or a report id: look both up in parallel.
  const [byIssue, byReport] = await Promise.all([
    prisma.issue.findUnique({ where: { id }, include: issueInclude }).catch(() => null),
    prisma.report.findUnique({ where: { id }, select: { issue: { include: issueInclude } } }).catch(() => null),
  ]);
  const issue = byIssue ?? byReport?.issue ?? null;

  if (!issue) {
    notFound();
  }

  const primaryReport = issue.reports.find((r) => r.role === EvidenceRole.REPORT) ?? issue.reports[0] ?? null;
  const reporterUser = primaryReport
    ? await prisma.user.findUnique({ where: { id: primaryReport.userId }, select: { name: true } }).catch(() => null)
    : null;
  const reporterName = reporterUser?.name || "Citizen Contributor";

  const statusLabelMap: Record<string, string> = {
    OPEN: "Reported",
    CONFIRMED: "Confirmed",
    ASSIGNED: "Assigned",
    IN_PROGRESS: "In Progress",
    CLAIMED_FIXED: "Repair Claimed",
    VERIFIED_FIXED: "Verified Fixed",
    DISPUTED: "Disputed",
    REJECTED: "Rejected",
  };

  const activeAuditTask = Boolean(session?.user?.id && issue.auditTasks.some(
    (task) => task.assigneeId === session.user.id && task.kind === "CLAIM_CHECK" && task.status === "OPEN"
  ));
  const status = activeAuditTask ? "IN_PROGRESS" : issue.status;
  const category = issue.category;
  const location = displayLocation(issue.address, issue.lat, issue.lng);
  const priorityScore = issue.priority;
  const priorityTier = priorityScore >= 70 ? "HIGH" : priorityScore >= 40 ? "MEDIUM" : "LOW";
  const primaryEvidence = issue.reports.find((r) => r.role === EvidenceRole.REPORT) ?? issue.reports[0] ?? null;
  const photoUrl = activeAuditTask
    ? primaryEvidence?.photoUrl ?? null
    : [...issue.reports].reverse().find((r) => r.photoUrl)?.photoUrl ?? null;
  const detailIssue = activeAuditTask
    ? {
        ...issue,
        status: "IN_PROGRESS" as const,
        contractorName: null,
        reports: issue.reports.filter((report) => report.role !== EvidenceRole.CLAIM_FIX),
        actions: issue.actions.filter((action) => action.action !== "CLAIM_FIX" && action.toStatus !== "CLAIMED_FIXED"),
      }
    : issue;
  const details = buildIssueTimelineAndDetails(detailIssue, reporterName);

  const backLink =
    session?.user?.role === "CITIZEN"
      ? "/citizen/dashboard"
      : session?.user?.role === "AUTHORITY"
        ? "/desk/dashboard"
        : "/";

  return (
    <div className="min-h-screen bg-[#F3F2EB] flex flex-col font-body">
      {session && <GlobalHeader role={session.user.role} />}
      <div className="flex-1">
        <ReportDetailView
        isSeed={issue.isSeed}
          id={issue.id}
          category={category}
          categoryLabel={categoryLabel(category)}
          location={location}
          coordinates={{ lat: issue.lat, lng: issue.lng }}
          reportedAt={details.reportedAtFormatted}
          status={status}
          statusLabel={statusLabelMap[status] || status.replace(/_/g, " ")}
          priority={priorityTier}
          priorityLabel={priorityTier === "HIGH" ? "High Priority" : priorityTier === "MEDIUM" ? "Medium Priority" : "Low Priority"}
          photoUrl={photoUrl}
          reporterName={reporterName}
          agencyName={issue.agency?.name || issue.assignments[0]?.personnel?.name || "Municipal Operations Desk"}
          notes={details.notes}
          photoSha256={details.photoSha256}
          signature={details.signature}
          gpsAccuracyM={details.gpsAccuracyM}
          timelineSteps={details.timelineSteps}
          auditNotice={session?.user?.role === "CITIZEN" && issue.status === "CLAIMED_FIXED"
            ? activeAuditTask
              ? "This repair is being independently audited. Action log is temporarily withheld while you have an active independent audit assignment for this location."
              : "This repair is being independently audited."
            : null}
          withholdAuditLog={activeAuditTask}
          auditLogs={activeAuditTask ? [] : details.auditLogs}
          verifications={activeAuditTask ? [] : details.verifications}
          backHref={backLink}
        />
      </div>
    </div>
  );
}
