import type { AuditKind, AuditObserved, Role, Status } from "@prisma/client";

/** Accounts must be this old before they can see or answer any audit task. */
export const AUDIT_MIN_ACCOUNT_AGE_MS = 24 * 3600 * 1000;
/** A status decision always needs at least this many different people agreeing. */
export const MIN_INDEPENDENT_VOTERS = 2;
/** Weighted thresholds (default auditor weight is 0.6). */
export const INTACT_WEIGHT_THRESHOLD = 1.5;
export const DAMAGED_WEIGHT_THRESHOLD = 1.0;

export type AuditIneligibleReason = "NOT_CITIZEN" | "ACCOUNT_TOO_NEW" | "IS_REPORTER" | "ALREADY_VOTED";

export type AuditEligibility =
  | { eligible: true }
  | { eligible: false; reason: AuditIneligibleReason; eligibleAt?: Date };

/** Account-level rules shared by the assigned and the public audit queue. */
export function accountAuditEligibility(
  user: { role: Role | string; createdAt: Date },
  now: Date = new Date()
): AuditEligibility {
  if (user.role !== "CITIZEN") return { eligible: false, reason: "NOT_CITIZEN" };
  const eligibleAt = new Date(user.createdAt.getTime() + AUDIT_MIN_ACCOUNT_AGE_MS);
  if (eligibleAt.getTime() > now.getTime()) {
    return { eligible: false, reason: "ACCOUNT_TOO_NEW", eligibleAt };
  }
  return { eligible: true };
}

export const INELIGIBLE_MESSAGES: Record<AuditIneligibleReason, string> = {
  NOT_CITIZEN: "Audits are answered by citizen accounts only.",
  ACCOUNT_TOO_NEW: "Not eligible yet: audits unlock 24 hours after you create your account.",
  IS_REPORTER: "You reported this issue, so you can't audit its repair.",
  ALREADY_VOTED: "You have already submitted an audit for this issue.",
};

export interface AuditVoteInput {
  userId: string;
  observed: AuditObserved | string;
  weight: number;
}

export type AuditDecision = "VERIFY_FIX" | "DISPUTE_FIX" | "REOPEN_IN_WARRANTY" | null;

/**
 * Decides whether the votes of one audit round change the issue status.
 * Only one vote per person counts (the first), and every decision needs at least
 * MIN_INDEPENDENT_VOTERS different people on the deciding side, so a single vote can never flip a status.
 */
export function evaluateAuditDecision(input: {
  kind: AuditKind | string;
  issueStatus: Status | string;
  votes: AuditVoteInput[];
}): { decision: AuditDecision; weightedIntact: number; weightedDamaged: number; intactVoters: number; damagedVoters: number } {
  const firstVoteByUser = new Map<string, AuditVoteInput>();
  for (const v of input.votes) {
    if (!firstVoteByUser.has(v.userId)) firstVoteByUser.set(v.userId, v);
  }
  const counted = Array.from(firstVoteByUser.values());
  const intact = counted.filter((v) => v.observed === "INTACT");
  const damaged = counted.filter((v) => v.observed === "DAMAGED");
  const weightedIntact = intact.reduce((s, v) => s + v.weight, 0);
  const weightedDamaged = damaged.reduce((s, v) => s + v.weight, 0);

  let decision: AuditDecision = null;
  if (input.kind === "CLAIM_CHECK" && input.issueStatus === "CLAIMED_FIXED") {
    if (
      intact.length >= MIN_INDEPENDENT_VOTERS &&
      weightedIntact >= INTACT_WEIGHT_THRESHOLD &&
      weightedIntact > weightedDamaged
    ) {
      decision = "VERIFY_FIX";
    } else if (damaged.length >= MIN_INDEPENDENT_VOTERS && weightedDamaged >= DAMAGED_WEIGHT_THRESHOLD) {
      decision = "DISPUTE_FIX";
    }
  } else if (input.kind === "DURABILITY" && input.issueStatus === "VERIFIED_FIXED") {
    if (damaged.length >= MIN_INDEPENDENT_VOTERS && weightedDamaged >= DAMAGED_WEIGHT_THRESHOLD) {
      decision = "REOPEN_IN_WARRANTY";
    }
  }
  return { decision, weightedIntact, weightedDamaged, intactVoters: intact.length, damagedVoters: damaged.length };
}

/** Errors from the audit flow carry the HTTP status the API should answer with. */
export class AuditError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AuditError";
  }
}
