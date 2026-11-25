import { formatDateTimeIST } from "@/lib/time/ist";
import { EvidenceRole, Status } from "@prisma/client";

export interface TimelineStepItem {
  title: string;
  timestamp: string;
  subtitle: string;
  status: "completed" | "current" | "pending" | "disputed";
}

export interface AuditLogItem {
  id: string;
  action: string;
  actorName: string;
  note?: string | null;
  createdAt: string;
}

export interface VerificationItem {
  id: string;
  observed: string;
  createdAt: string;
  verifierName?: string;
}

interface BuildInputIssue {
  id: string;
  status: Status | string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  contractorName?: string | null;
  agency?: { name: string } | null;
  assignments?: Array<{
    createdAt: Date | string;
    personnel: { name: string; role?: string };
  }>;
  reports?: Array<{
    id: string;
    role: EvidenceRole | string;
    note?: string | null;
    photoSha256?: string | null;
    signature?: string | null;
    gpsAccuracyM?: number | null;
    capturedAt?: Date | string | null;
    createdAt: Date | string;
  }>;
  actions?: Array<{
    id: string;
    action: string;
    actorId: string;
    note?: string | null;
    createdAt: Date | string;
  }>;
  verifications?: Array<{
    id: string;
    observed?: string;
    verdict?: string;
    createdAt: Date | string;
  }>;
  auditTasks?: Array<{
    id: string;
    status: string;
    votes?: Array<{
      id: string;
      observed: string;
      createdAt: Date | string;
    }>;
  }>;
}

export function buildIssueTimelineAndDetails(
  issue: BuildInputIssue,
  reporterName: string
) {
  const reports = issue.reports || [];
  const primaryReport =
    reports.find((r) => r.role === EvidenceRole.REPORT) ?? reports[0] ?? null;
  const claimReport =
    reports.find((r) => r.role === EvidenceRole.CLAIM_FIX) ?? null;
  const actions = issue.actions || [];
  const assignment = issue.assignments?.[0] ?? null;

  const findAction = (names: string[]) =>
    actions.find((a) => names.includes(a.action));

  const assignAction = findAction([
    "ASSIGN_AGENCY",
    "REASSIGN_AGENCY",
    "ASSIGN_PERSONNEL",
    "CONFIRM",
  ]);
  const startWorkAction = findAction(["START_WORK"]);
  const claimAction = findAction(["CLAIM_FIX"]);
  const verifyAction = findAction(["VERIFY_FIX", "AUDIT_VERIFIED"]);
  const disputeAction = findAction(["DISPUTE", "AUDIT_DISPUTED", "REOPEN", "REOPEN_IN_WARRANTY"]);
  const rejectAction = findAction(["REJECT"]);

  const reportedTime = formatDateTimeIST(
    primaryReport?.capturedAt || issue.createdAt
  );

  const isAssignedOrBeyond =
    issue.status !== "OPEN" || Boolean(issue.agency) || Boolean(assignment) || Boolean(assignAction);

  const assignTime = assignAction
    ? formatDateTimeIST(assignAction.createdAt)
    : assignment
      ? formatDateTimeIST(assignment.createdAt)
      : isAssignedOrBeyond
        ? formatDateTimeIST(issue.updatedAt || issue.createdAt)
        : "Pending";

  const assignedTarget =
    issue.agency?.name ||
    (assignment?.personnel
      ? `${assignment.personnel.name}${assignment.personnel.role ? ` (${assignment.personnel.role})` : ""}`
      : "Municipal Operations Desk");

  const isClaimedOrBeyond =
    issue.status === "CLAIMED_FIXED" ||
    issue.status === "VERIFIED_FIXED" ||
    issue.status === "DISPUTED" ||
    Boolean(claimAction) ||
    Boolean(claimReport);

  const isInProgress = issue.status === "IN_PROGRESS";

  const repairTime = isClaimedOrBeyond
    ? formatDateTimeIST(
        claimAction?.createdAt ||
          claimReport?.createdAt ||
          issue.updatedAt ||
          issue.createdAt
      )
    : isInProgress
      ? startWorkAction
        ? formatDateTimeIST(startWorkAction.createdAt)
        : "In progress"
      : "Pending";

  const repairStepStatus: TimelineStepItem["status"] = isClaimedOrBeyond
    ? "completed"
    : isInProgress
      ? "current"
      : "pending";

  const repairTitle = isClaimedOrBeyond
    ? "Repair Claimed"
    : isInProgress
      ? "Repair In Progress"
      : "Field Repair";

  const repairSubtitle = isClaimedOrBeyond
    ? issue.contractorName
      ? `Contractor: ${issue.contractorName}`
      : "Repair claimed with signed on-site photo"
    : isInProgress
      ? "Field team work underway"
      : "Awaiting field dispatch & repair photo";

  let verificationStep: TimelineStepItem;
  if (issue.status === "VERIFIED_FIXED") {
    verificationStep = {
      title: "Verified Fixed",
      timestamp: formatDateTimeIST(
        verifyAction?.createdAt || issue.updatedAt || issue.createdAt
      ),
      subtitle: "Repair independently verified by citizen audit",
      status: "completed",
    };
  } else if (issue.status === "DISPUTED") {
    verificationStep = {
      title: "Repair Disputed",
      timestamp: formatDateTimeIST(
        disputeAction?.createdAt || issue.updatedAt || issue.createdAt
      ),
      subtitle: "Community ground-truth audit disputed claimed repair",
      status: "disputed",
    };
  } else if (issue.status === "REJECTED") {
    verificationStep = {
      title: "Issue Rejected",
      timestamp: formatDateTimeIST(
        rejectAction?.createdAt || issue.updatedAt || issue.createdAt
      ),
      subtitle: rejectAction?.note || "Closed by municipal operations desk",
      status: "disputed",
    };
  } else if (issue.status === "CLAIMED_FIXED") {
    verificationStep = {
      title: "Awaiting Verification",
      timestamp: "In progress",
      subtitle: "Awaiting independent citizen ground-truth confirmation",
      status: "current",
    };
  } else {
    verificationStep = {
      title: "Independent Verification",
      timestamp: "Pending",
      subtitle: "Blind citizen audit begins after repair is claimed",
      status: "pending",
    };
  }

  const timelineSteps: TimelineStepItem[] = [
    {
      title: "Reported",
      timestamp: reportedTime,
      subtitle: `Citizen: ${reporterName} (Digitally signed ECDSA P-256)`,
      status: "completed",
    },
    {
      title: "Assigned to Agency",
      timestamp: assignTime,
      subtitle: isAssignedOrBeyond
        ? `Assigned to: ${assignedTarget}`
        : "Awaiting agency or personnel assignment",
      status: isAssignedOrBeyond ? "completed" : "current",
    },
    {
      title: repairTitle,
      timestamp: repairTime,
      subtitle: repairSubtitle,
      status: repairStepStatus,
    },
    verificationStep,
  ];

  const auditLogs: AuditLogItem[] = actions.map((a) => ({
    id: a.id,
    action: a.action,
    actorName: a.actorId === "system" ? "System" : "Municipal Desk",
    note: a.note,
    createdAt: formatDateTimeIST(a.createdAt),
  }));

  const auditVotes = (issue.auditTasks || []).flatMap((t) => t.votes || []);
  const legacyVerifications = issue.verifications || [];
  const verifications: VerificationItem[] = [
    ...auditVotes.map((v) => ({
      id: v.id,
      observed: v.observed,
      createdAt: formatDateTimeIST(v.createdAt),
      verifierName: "Independent Citizen Auditor",
    })),
    ...legacyVerifications.map((v) => ({
      id: v.id,
      observed: v.observed || v.verdict || "VERIFIED",
      createdAt: formatDateTimeIST(v.createdAt),
      verifierName: "Community Verifier",
    })),
  ];

  return {
    timelineSteps,
    auditLogs,
    verifications,
    notes: primaryReport?.note?.trim() || null,
    photoSha256: primaryReport?.photoSha256 || null,
    signature: primaryReport?.signature || null,
    gpsAccuracyM: primaryReport?.gpsAccuracyM ?? null,
    reportedAtFormatted: reportedTime,
  };
}
