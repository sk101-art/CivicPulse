import { prisma } from "@/lib/db/prisma";
import {
  Status,
  Role,
  EvidenceRole,
  AuditKind,
  AuditTaskStatus,
  AuditObserved,
} from "@prisma/client";
import { haversineDistanceM, type EvidencePayload } from "@/lib/evidence/sign";
import { verifyEvidence } from "@/lib/evidence/verify";
import { uploadEvidencePhoto } from "@/lib/external/storage";
import { transition } from "@/lib/issues/stateMachine";
import { awardPoints } from "@/lib/points";
import {
  AuditError,
  accountAuditEligibility,
  evaluateAuditDecision,
  INELIGIBLE_MESSAGES,
  type AuditEligibility,
  type AuditIneligibleReason,
} from "@/lib/audit/rules";
import crypto from "crypto";

export interface BlindAuditTaskView {
  id: string;
  lat: number;
  lng: number;
  address: string | null;
  challengeBearingDeg: number;
  challengeNonce: string;
  dueAt: Date;
  status: AuditTaskStatus;
  distanceM?: number;
}

/**
 * Validates device heading against challenge bearing within +/- 45 degrees.
 * Heading is optional; if omitted/null, it is accepted.
 */
export function isHeadingWithinTolerance(
  deviceHeading: number | null | undefined,
  challengeBearing: number
): boolean {
  if (deviceHeading === null || deviceHeading === undefined || isNaN(deviceHeading)) {
    return true; // Optional heading
  }
  const rawDiff = Math.abs(deviceHeading - challengeBearing) % 360;
  const diff = rawDiff > 180 ? 360 - rawDiff : rawDiff;
  return diff <= 45;
}

/**
 * Calculates auditor reliability score using Laplace-smoothed accuracy:
 * reliability = (passed + 1) / (total + 2), starts at 0.6 if total is 0.
 */
export function calculateAuditorReliability(
  controlsPassed: number,
  controlsTotal: number
): number {
  if (controlsTotal <= 0) {
    return 0.6;
  }
  const rel = (controlsPassed + 1) / (controlsTotal + 2);
  return Math.min(1, Math.max(0, Number(rel.toFixed(4))));
}

/** Start of the current audit round: votes before it belong to an earlier claim. */
function roundStart(issue: { repairClaimedAt: Date | null; createdAt: Date }): Date {
  return issue.repairClaimedAt ?? issue.createdAt;
}

/**
 * Issue-level eligibility (on top of the account rules): the reporter never audits their own issue and
 * every person gets one vote per issue per audit round. Returns null when the user may vote.
 */
export async function auditIneligibilityForIssue(
  userId: string,
  issue: {
    id: string;
    repairClaimedAt: Date | null;
    createdAt: Date;
    reports: Array<{ userId: string; role: EvidenceRole }>;
  },
  kind: AuditKind
): Promise<AuditIneligibleReason | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, createdAt: true },
  });
  if (!user) return "NOT_CITIZEN";
  const account = accountAuditEligibility(user);
  if (!account.eligible) return account.reason;

  if (issue.reports.some((r) => r.role === EvidenceRole.REPORT && r.userId === userId)) {
    return "IS_REPORTER";
  }

  const priorVote = await prisma.auditVote.findFirst({
    where: {
      userId,
      createdAt: { gte: roundStart(issue) },
      task: { issueId: issue.id, kind },
    },
    select: { id: true },
  });
  return priorVote ? "ALREADY_VOTED" : null;
}

export interface AuditTaskListing {
  eligible: boolean;
  reason?: AuditIneligibleReason;
  message?: string;
  eligibleAt?: Date;
  tasks: BlindAuditTaskView[];
}

/**
 * Open audit tasks a user may answer right now. Ineligible users get no tasks and therefore never
 * receive a challenge nonce. Blindness: only location, bearing, nonce and deadline leave the server.
 */
export async function listAuditTasksForUser(
  userId: string,
  coords?: { lat: number; lng: number } | null
): Promise<AuditTaskListing> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, createdAt: true },
  });
  const account: AuditEligibility = user
    ? accountAuditEligibility(user)
    : { eligible: false, reason: "NOT_CITIZEN" };
  if (!account.eligible) {
    return {
      eligible: false,
      reason: account.reason,
      message: INELIGIBLE_MESSAGES[account.reason],
      eligibleAt: account.eligibleAt,
      tasks: [],
    };
  }

  const now = new Date();
  const [tasks, myVotes] = await Promise.all([
    prisma.auditTask.findMany({
      where: {
        status: AuditTaskStatus.OPEN,
        dueAt: { gt: now },
        OR: [{ assigneeId: userId }, { assigneeId: null }],
      },
      include: {
        issue: {
          select: {
            id: true,
            lat: true,
            lng: true,
            address: true,
            repairClaimedAt: true,
            createdAt: true,
            reports: { where: { role: EvidenceRole.REPORT }, select: { userId: true } },
          },
        },
      },
      orderBy: { dueAt: "asc" },
      take: 50,
    }),
    prisma.auditVote.findMany({
      where: { userId },
      select: { createdAt: true, task: { select: { issueId: true, kind: true } } },
    }),
  ]);

  const seen = new Set<string>();
  const visible: BlindAuditTaskView[] = [];
  for (const t of tasks) {
    const key = `${t.issueId}:${t.kind}`;
    if (seen.has(key)) continue; // one task per issue round, even if old duplicates exist
    if (t.issue.reports.some((r) => r.userId === userId)) continue;
    const start = roundStart(t.issue).getTime();
    if (myVotes.some((v) => v.task.issueId === t.issueId && v.task.kind === t.kind && v.createdAt.getTime() >= start)) {
      continue;
    }
    seen.add(key);
    visible.push({
      id: t.id,
      lat: t.issue.lat,
      lng: t.issue.lng,
      address: t.issue.address,
      challengeBearingDeg: t.challengeBearingDeg,
      challengeNonce: t.challengeNonce,
      dueAt: t.dueAt,
      status: t.status,
      distanceM:
        coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
          ? Math.round(haversineDistanceM(coords.lat, coords.lng, t.issue.lat, t.issue.lng))
          : undefined,
    });
  }

  if (coords) visible.sort((a, b) => (a.distanceM ?? 999999) - (b.distanceM ?? 999999));
  return { eligible: true, tasks: visible.slice(0, 20) };
}

/**
 * Assigns 3 random eligible citizens to audit an issue (Track B Blind Repair Audit).
 * Eligibility:
 * 1. Account older than 24 hours.
 * 2. Not the reporter of this issue.
 * 3. Not any desk account (CITIZEN role only).
 * 4. Active in last 30 days.
 * 5. Last known location within 3 km -> widen to 10 km -> fallback to ONE open public task (assigneeId: null).
 * Never creates a second open task for the same assignee, or a second open public task, per issue and kind.
 * 1 in 5 tasks sent to a user is a CONTROL on a known-state issue.
 */
export async function assignBlindAuditTasks(
  issueId: string,
  count: number = 3,
  isSeed: boolean = false,
  roundKind: AuditKind = AuditKind.CLAIM_CHECK
) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      reports: { select: { userId: true, role: true } },
    },
  });

  if (!issue) {
    throw new Error(`Issue not found: ${issueId}`);
  }

  const reporterIds = new Set(
    issue.reports.filter((r) => r.role === EvidenceRole.REPORT).map((r) => r.userId)
  );

  const existingOpen = await prisma.auditTask.findMany({
    where: { issueId: issue.id, kind: roundKind, status: AuditTaskStatus.OPEN },
    select: { assigneeId: true },
  });
  const alreadyAssigned = new Set(
    (existingOpen ?? []).map((t) => t.assigneeId).filter((id): id is string => !!id)
  );
  const hasOpenPublicTask = (existingOpen ?? []).some((t) => t.assigneeId === null);

  const now = Date.now();
  const accountAgeCutoff = new Date(now - 24 * 3600 * 1000); // > 24 hours
  const activeCutoff = new Date(now - 30 * 24 * 3600 * 1000); // last 30 days

  // Fetch all potential citizen candidates
  const potentialCitizens = await prisma.user.findMany({
    where: {
      role: Role.CITIZEN,
      createdAt: { lte: accountAgeCutoff },
      id: { notIn: Array.from(reporterIds) },
    },
    include: {
      auditTasks: {
        select: { id: true, kind: true },
      },
    },
  });

  const candidateIds = potentialCitizens.map((u) => u.id);

  // Fetch latest reports for candidate users
  const candidateReports = await prisma.report.findMany({
    where: { userId: { in: candidateIds } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, lat: true, lng: true, createdAt: true },
  });

  const userLatestReportMap = new Map<string, { lat: number; lng: number; createdAt: Date }>();
  for (const rep of candidateReports) {
    if (!userLatestReportMap.has(rep.userId)) {
      userLatestReportMap.set(rep.userId, rep);
    }
  }

  // Filter candidates active in last 30 days (by account creation or recent activity)
  const activeCandidates = potentialCitizens.filter((u) => {
    const latestRep = userLatestReportMap.get(u.id);
    const hasRecentReport = latestRep ? latestRep.createdAt >= activeCutoff : false;
    const isRecentlyCreated = u.createdAt >= activeCutoff;
    return hasRecentReport || isRecentlyCreated;
  });

  // Calculate distance for each candidate with a known location
  const withDistance = activeCandidates
    .map((user) => {
      const latestReport = userLatestReportMap.get(user.id);
      const distanceM = latestReport
        ? haversineDistanceM(issue.lat, issue.lng, latestReport.lat, latestReport.lng)
        : null;
      return { user, distanceM };
    })
    .filter((c) => c.distanceM !== null) as Array<{
    user: (typeof activeCandidates)[0];
    distanceM: number;
  }>;

  // Filter 3 km, then widen to 10 km
  let qualifiedUsers = withDistance.filter((c) => c.distanceM <= 3000).map((c) => c.user);
  if (qualifiedUsers.length < count) {
    qualifiedUsers = withDistance.filter((c) => c.distanceM <= 10000).map((c) => c.user);
  }

  // Shuffle qualified candidates, skipping anyone who already holds an open task for this round
  const shuffled = [...qualifiedUsers]
    .filter((u) => !alreadyAssigned.has(u.id))
    .sort(() => 0.5 - Math.random());
  const selectedAssignees = shuffled.slice(0, Math.max(0, count - alreadyAssigned.size));

  // Unfilled slots are covered by ONE open public task that accepts one vote from each eligible
  // citizen, never by several duplicate public tasks for the same spot.
  const taskAssigneeIds: Array<string | null> = selectedAssignees.map((u) => u.id);
  if (alreadyAssigned.size + taskAssigneeIds.length < count && !hasOpenPublicTask) {
    taskAssigneeIds.push(null);
  }

  const createdTasks = [];
  const dueAt = new Date(now + 48 * 3600 * 1000); // 48-hour deadline

  for (const assigneeId of taskAssigneeIds) {
    const challengeBearingDeg = Math.floor(Math.random() * 360);
    const challengeNonce = crypto.randomUUID();

    // Check if this task should be a CONTROL (1 in 5 tasks sent to user)
    let kind: AuditKind = roundKind;
    let targetIssueId = issue.id;

    if (assigneeId) {
      const user = activeCandidates.find((u) => u.id === assigneeId);
      const totalUserTasks = user?.auditTasks?.length ?? 0;
      if ((totalUserTasks + 1) % 5 === 0) {
        // Attempt to find a control issue (recently VERIFIED_FIXED with >= 3 votes, or OPEN with fresh reports)
        const controlIssue = await prisma.issue.findFirst({
          where: {
            id: { not: issue.id },
            OR: [
              { status: Status.VERIFIED_FIXED, isSeed: false },
              { status: Status.OPEN, isSeed: false, createdAt: { gte: activeCutoff } },
            ],
          },
          select: { id: true },
        });

        if (controlIssue) {
          kind = AuditKind.CONTROL;
          targetIssueId = controlIssue.id;
        }
      }
    }

    const task = await prisma.auditTask.create({
      data: {
        issueId: targetIssueId,
        assigneeId,
        kind,
        dueAt,
        challengeBearingDeg,
        challengeNonce,
        status: AuditTaskStatus.OPEN,
        isSeed,
      },
    });

    createdTasks.push(task);
  }

  return createdTasks;
}

export interface SubmitAuditVoteInput {
  userId: string;
  taskId: string;
  observed: AuditObserved;
  deviceHeadingDeg?: number;
  evidence: {
    payload: EvidencePayload;
    signature: string;
    photoBase64: string;
    mimeType?: string;
  };
}

/**
 * Records an auditor vote with Web Crypto signed evidence, heading check,
 * auditor reliability scoring (on controls), and the quorum decision (≥ 2 independent voters).
 * Failures throw AuditError carrying the HTTP status (400 evidence, 403 eligibility, 409 repeat/closed).
 */
export async function submitAuditVote(input: SubmitAuditVoteInput) {
  const { userId, taskId, observed, deviceHeadingDeg, evidence } = input;

  const task = await prisma.auditTask.findUnique({
    where: { id: taskId },
    include: {
      issue: {
        include: {
          reports: { select: { userId: true, role: true } },
        },
      },
    },
  });

  if (!task) {
    throw new AuditError(404, "NOT_FOUND", "Audit task not found");
  }

  if (task.status !== AuditTaskStatus.OPEN) {
    throw new AuditError(409, "TASK_CLOSED", `Audit task is already ${task.status}`);
  }

  if (new Date() > task.dueAt) {
    await prisma.auditTask.update({
      where: { id: taskId },
      data: { status: AuditTaskStatus.EXPIRED },
    });
    throw new AuditError(409, "TASK_EXPIRED", "Audit task has expired");
  }

  // If task is assigned to a specific citizen, only they can vote
  if (task.assigneeId && task.assigneeId !== userId) {
    throw new AuditError(403, "FORBIDDEN", "You are not authorized to complete this audit task");
  }

  // Same rules for assigned and public tasks: citizen, account ≥ 24 h, not the reporter, one vote per issue.
  const ineligible = await auditIneligibilityForIssue(userId, task.issue, task.kind);
  if (ineligible) {
    throw new AuditError(ineligible === "ALREADY_VOTED" ? 409 : 403, ineligible, INELIGIBLE_MESSAGES[ineligible]);
  }

  // Verify challenge nonce matches
  if (evidence.payload.nonce !== task.challengeNonce) {
    throw new AuditError(400, "AUDIT_VOTE_REJECTED", "Invalid challenge nonce for audit task");
  }

  // Verify role is AUDIT
  if (evidence.payload.role !== ("AUDIT" as EvidenceRole)) {
    throw new AuditError(400, "AUDIT_VOTE_REJECTED", `Evidence role must be AUDIT (got ${evidence.payload.role})`);
  }

  // Verify heading if provided
  if (!isHeadingWithinTolerance(deviceHeadingDeg, task.challengeBearingDeg)) {
    throw new AuditError(
      400,
      "AUDIT_VOTE_REJECTED",
      `Device heading (${deviceHeadingDeg}°) is outside tolerance (+/- 45°) of challenge bearing (${task.challengeBearingDeg}°)`
    );
  }

  // Verify distance <= 30m
  const distanceM = haversineDistanceM(
    task.issue.lat,
    task.issue.lng,
    evidence.payload.lat,
    evidence.payload.lng
  );
  if (distanceM > 30) {
    throw new AuditError(
      400,
      "AUDIT_VOTE_REJECTED",
      `Audit photo must be taken within 30m of the challenge spot (distance was ${Math.round(distanceM)}m)`
    );
  }

  // Verify ECDSA signature and nonce freshness
  const photoBuffer = Buffer.from(evidence.photoBase64, "base64");
  const verifyResult = await verifyEvidence(userId, evidence.payload, evidence.signature, photoBuffer);
  if (!verifyResult.valid) {
    throw new AuditError(400, "AUDIT_VOTE_REJECTED", `Cryptographic evidence verification failed: ${verifyResult.reason}`);
  }

  // Upload photo to storage
  const uploaded = await uploadEvidencePhoto({
    issueId: task.issue.id,
    reportId: crypto.randomUUID(),
    buffer: photoBuffer,
    mimeType: evidence.mimeType || "image/jpeg",
  });

  // Lookup auditor reliability score
  const existingScore = await prisma.auditorScore.findUnique({
    where: { userId },
  });
  const voteWeight = existingScore?.reliability ?? 0.6;

  // Process vote in transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create Report record
    const report = await tx.report.create({
      data: {
        issueId: task.issue.id,
        userId,
        role: EvidenceRole.AUDIT,
        photoUrl: uploaded.url,
        photoSha256: uploaded.photoSha256,
        signature: evidence.signature,
        // A public task's challenge is shared by its voters and Report.nonce is unique: scope it per voter.
        nonce: `${evidence.payload.nonce}:${userId}`,
        lat: evidence.payload.lat,
        lng: evidence.payload.lng,
        gpsAccuracyM: evidence.payload.accuracy,
        headingDeg: deviceHeadingDeg ?? null,
        capturedAt: new Date(evidence.payload.capturedAt),
        note: `Blind audit: observed ${observed} facing ${deviceHeadingDeg ?? task.challengeBearingDeg}°`,
      },
    });

    // 2. Create AuditVote
    const vote = await tx.auditVote.create({
      data: {
        taskId: task.id,
        userId,
        observed,
        weight: voteWeight,
      },
    });

    // 3. An assigned task is finished by its one vote; a public task stays open for other voters.
    const updatedTask = task.assigneeId
      ? await tx.auditTask.update({
          where: { id: task.id },
          data: {
            status: AuditTaskStatus.DONE,
            completedAt: new Date(),
            reportId: report.id,
          },
        })
      : task;

    // 4. If CONTROL task, update AuditorScore
    if (task.kind === AuditKind.CONTROL) {
      let isPassed = false;
      if (task.issue.status === Status.VERIFIED_FIXED && observed === AuditObserved.INTACT) {
        isPassed = true;
      } else if (
        (task.issue.status === Status.OPEN || task.issue.status === Status.CONFIRMED) &&
        observed === AuditObserved.DAMAGED
      ) {
        isPassed = true;
      }

      const passed = isPassed
        ? (existingScore?.controlsPassed ?? 0) + 1
        : existingScore?.controlsPassed ?? 0;
      const total = (existingScore?.controlsTotal ?? 0) + 1;
      const newReliability = calculateAuditorReliability(passed, total);

      await tx.auditorScore.upsert({
        where: { userId },
        create: {
          userId,
          controlsPassed: passed,
          controlsTotal: total,
          reliability: newReliability,
        },
        update: {
          controlsPassed: passed,
          controlsTotal: total,
          reliability: newReliability,
        },
      });
    }

    // 5. Evaluate the round: all votes on this issue and kind since the current claim
    let transitionResult = null;
    const cycleVotes = await tx.auditVote.findMany({
      where: {
        task: {
          issueId: task.issue.id,
          kind: task.kind,
        },
        createdAt: { gte: roundStart(task.issue) },
      },
      orderBy: { createdAt: "asc" },
    });

    // Quorum: one vote per person counts and a decision needs at least two independent voters.
    const outcome = evaluateAuditDecision({
      kind: task.kind,
      issueStatus: task.issue.status,
      votes: cycleVotes,
    });
    const { weightedIntact, weightedDamaged } = outcome;

    if (outcome.decision === "VERIFY_FIX") {
      transitionResult = transition(
        task.issue,
        "VERIFY_FIX",
        { id: "SYSTEM", role: "SYSTEM" },
        {
          note: `Fix verified by blind citizen audit (${outcome.intactVoters} voters, weighted INTACT: ${weightedIntact.toFixed(2)}, DAMAGED: ${weightedDamaged.toFixed(2)})`,
          verification: { sumFixedWeights: weightedIntact, reportId: report.id },
        }
      );
    } else if (outcome.decision === "DISPUTE_FIX") {
      transitionResult = transition(
        task.issue,
        "DISPUTE_FIX",
        { id: "SYSTEM", role: "SYSTEM" },
        {
          note: `Fix disputed by blind citizen audit (${outcome.damagedVoters} voters, weighted DAMAGED: ${weightedDamaged.toFixed(2)})`,
          verification: { disputeWeight: weightedDamaged, reportId: report.id },
        }
      );
    } else if (outcome.decision === "REOPEN_IN_WARRANTY") {
      const claimStartTime = task.issue.repairClaimedAt?.getTime() ?? task.issue.createdAt.getTime();
      const lifespanDays = Math.max(
        1,
        Math.round((Date.now() - claimStartTime) / (24 * 3600 * 1000))
      );

      transitionResult = transition(
        task.issue,
        "REOPEN_IN_WARRANTY",
        { id: "SYSTEM", role: "SYSTEM" },
        {
          note: `Repair failed durability audit during warranty period (lifespan: ${lifespanDays} days, ${outcome.damagedVoters} voters, weighted DAMAGED: ${weightedDamaged.toFixed(2)})`,
        }
      );

      transitionResult.issueUpdateData.lifespanDays = lifespanDays;
    }

    let updatedIssue = task.issue;
    let actionLog = null;

    if (transitionResult) {
      updatedIssue = await tx.issue.update({
        where: { id: task.issue.id },
        data: transitionResult.issueUpdateData,
        include: {
          reports: { select: { userId: true, role: true } },
        },
      });

      actionLog = await tx.actionLog.create({
        data: transitionResult.actionLogData,
      });

      // The round is decided: close its remaining open tasks so no further challenges are handed out.
      await tx.auditTask.updateMany({
        where: { issueId: task.issue.id, kind: task.kind, status: AuditTaskStatus.OPEN },
        data: { status: AuditTaskStatus.EXPIRED },
      });
    }

    // Award citizen points (+25 XP for blind audit)
    await awardPoints(tx, {
      userId,
      event: "VERIFICATION_ACCEPTED",
      reason: `Blind audit observed ${observed} recorded`,
    });

    return {
      task: updatedTask,
      vote,
      report,
      issue: updatedIssue,
      actionLog,
    };
  });

  return result;
}

/**
 * Durability scheduler: runs hourly.
 * For VERIFIED_FIXED issues inside warranty:
 * 1. Checks milestones: claim + 7d, + 30d, + 90d.
 * 2. Checks rain trigger: within 48h after any day with rain >= 20 mm.
 */
export async function runDurabilityJob(now: Date = new Date()) {
  const eligibleIssues = await prisma.issue.findMany({
    where: {
      status: Status.VERIFIED_FIXED,
      repairClaimedAt: { not: null },
      warrantyUntil: { gte: now },
    },
    include: {
      auditTasks: {
        where: { kind: AuditKind.DURABILITY },
        select: { id: true, createdAt: true, status: true },
      },
    },
  });

  // Check recent heavy rain (>= 20 mm in last 48h) from WeatherForecast
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 3600 * 1000);
  const heavyRainRecords = await prisma.weatherForecast.findMany({
    where: {
      hour: { gte: fortyEightHoursAgo, lte: now },
      precipMm: { gte: 20 },
    },
    take: 1,
  });
  const hasRecentHeavyRain = heavyRainRecords.length > 0;

  let createdTasksCount = 0;

  for (const issue of eligibleIssues) {
    const claimTime = issue.repairClaimedAt!.getTime();
    const daysSinceClaim = (now.getTime() - claimTime) / (24 * 3600 * 1000);

    let needsDurability = false;

    // Check milestones
    const existingDays = issue.auditTasks.map(
      (t) => (t.createdAt.getTime() - claimTime) / (24 * 3600 * 1000)
    );

    const has7d = existingDays.some((d) => d >= 6 && d <= 14);
    const has30d = existingDays.some((d) => d >= 28 && d <= 45);
    const has90d = existingDays.some((d) => d >= 85 && d <= 120);

    if (daysSinceClaim >= 7 && !has7d) {
      needsDurability = true;
    } else if (daysSinceClaim >= 30 && !has30d) {
      needsDurability = true;
    } else if (daysSinceClaim >= 90 && !has90d) {
      needsDurability = true;
    } else if (hasRecentHeavyRain) {
      // Check if rain durability task created in last 48h
      const hasRecentTask = issue.auditTasks.some(
        (t) => t.createdAt >= fortyEightHoursAgo
      );
      if (!hasRecentTask) {
        needsDurability = true;
      }
    }

    if (needsDurability) {
      // Durability tasks are created with their kind directly (no create-then-update round trip)
      const tasks = await assignBlindAuditTasks(issue.id, 3, issue.isSeed, AuditKind.DURABILITY);
      createdTasksCount += tasks.length;
    }
  }

  return { processed: eligibleIssues.length, createdTasksCount };
}
