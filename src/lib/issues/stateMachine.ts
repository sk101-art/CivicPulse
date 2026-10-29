import { Status, type Band, type Prisma } from "@prisma/client";

export type IssueAction =
  | "CONFIRM"
  | "REJECT"
  | "ASSIGN_AGENCY"
  | "REASSIGN_AGENCY"
  | "START_WORK"
  | "CLAIM_FIX"
  | "VERIFY_FIX"
  | "DISPUTE_FIX"
  | "REOPEN"
  | "OVERRIDE_BAND"
  | "REOPEN_IN_WARRANTY";

export type ActorRole = "AUTHORITY" | "SYSTEM" | "CITIZEN";

export interface StateMachineActor {
  id: string;
  role: ActorRole;
}

export interface EvidenceContext {
  reportId?: string;
  role?: string;
  distanceM?: number;
}

export interface VerificationContext {
  sumFixedWeights?: number;
  disputeWeight?: number;
  reportId?: string;
}

export interface TransitionContext {
  note?: string;
  agencyId?: string;
  evidence?: EvidenceContext;
  verification?: VerificationContext;
  overrideBand?: string;
}

export interface IssueStateInput {
  id: string;
  status: Status;
  agencyId?: string | null;
  handoffCount?: number;
}

export interface TransitionResult {
  fromStatus: Status;
  toStatus: Status;
  action: IssueAction;
  actorId: string;
  actionLogData: Prisma.ActionLogUncheckedCreateInput;
  issueUpdateData: Prisma.IssueUncheckedUpdateInput;
}

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly fromStatus: Status,
    public readonly action: IssueAction,
    public readonly reason: string
  ) {
    super(
      `Invalid transition: cannot perform action '${action}' on issue with status '${fromStatus}'. Reason: ${reason}`
    );
    this.name = "InvalidStateTransitionError";
  }
}

interface TransitionRule {
  from: Status[];
  action: IssueAction;
  to: (from: Status) => Status;
  allowedRoles: ActorRole[];
  validate?: (context: TransitionContext, from: Status) => string | null;
}

const TRANSITION_RULES: TransitionRule[] = [
  // 1. OPEN -> CONFIRMED (Desk)
  {
    from: [Status.OPEN],
    action: "CONFIRM",
    to: () => Status.CONFIRMED,
    allowedRoles: ["AUTHORITY"],
  },

  // 2. OPEN -> REJECTED (Desk, requires written reason)
  {
    from: [Status.OPEN],
    action: "REJECT",
    to: () => Status.REJECTED,
    allowedRoles: ["AUTHORITY"],
    validate: (ctx) => {
      if (!ctx.note || ctx.note.trim().length === 0) {
        return "A written reason (note) is required to reject an issue";
      }
      return null;
    },
  },

  // 3. CONFIRMED / DISPUTED / REOPENED_IN_WARRANTY -> ASSIGNED (Desk, requires agency label)
  {
    from: [Status.CONFIRMED, Status.DISPUTED, Status.REOPENED_IN_WARRANTY],
    action: "ASSIGN_AGENCY",
    to: () => Status.ASSIGNED,
    allowedRoles: ["AUTHORITY"],
    validate: (ctx) => {
      if (!ctx.agencyId || ctx.agencyId.trim().length === 0) {
        return "An agency label (agencyId) is required to assign an issue";
      }
      return null;
    },
  },

  // 3b. Reassign agency (Desk, status stays ASSIGNED or IN_PROGRESS, increments handoffs)
  {
    from: [Status.ASSIGNED, Status.IN_PROGRESS],
    action: "REASSIGN_AGENCY",
    to: (from) => from,
    allowedRoles: ["AUTHORITY"],
    validate: (ctx) => {
      if (!ctx.agencyId || ctx.agencyId.trim().length === 0) {
        return "A new agency label (agencyId) is required for reassignment";
      }
      return null;
    },
  },

  // 4. ASSIGNED / DISPUTED / REOPENED_IN_WARRANTY -> IN_PROGRESS (Desk)
  {
    from: [Status.ASSIGNED, Status.DISPUTED, Status.REOPENED_IN_WARRANTY],
    action: "START_WORK",
    to: () => Status.IN_PROGRESS,
    allowedRoles: ["AUTHORITY"],
  },

  // 5. CONFIRMED, ASSIGNED, IN_PROGRESS, DISPUTED, REOPENED_IN_WARRANTY -> CLAIMED_FIXED (Desk, requires signed photo <= 50m)
  {
    from: [Status.CONFIRMED, Status.ASSIGNED, Status.IN_PROGRESS, Status.DISPUTED, Status.REOPENED_IN_WARRANTY],
    action: "CLAIM_FIX",
    to: () => Status.CLAIMED_FIXED,
    allowedRoles: ["AUTHORITY"],
    validate: (ctx) => {
      if (!ctx.evidence) {
        return "Claiming a fix requires signed evidence";
      }
      if (ctx.evidence.role && ctx.evidence.role !== "CLAIM_FIX") {
        return `Claiming a fix requires evidence with role CLAIM_FIX (got ${ctx.evidence.role})`;
      }
      if (
        ctx.evidence.distanceM !== undefined &&
        ctx.evidence.distanceM > 50
      ) {
        return `Claim photo must be taken within 50m of the issue (distance was ${Math.round(ctx.evidence.distanceM)}m)`;
      }
      return null;
    },
  },

  // 6. CLAIMED_FIXED -> VERIFIED_FIXED (System, sum of FIXED verification weights >= 1.0)
  {
    from: [Status.CLAIMED_FIXED],
    action: "VERIFY_FIX",
    to: () => Status.VERIFIED_FIXED,
    allowedRoles: ["SYSTEM"],
    validate: (ctx) => {
      const sum = ctx.verification?.sumFixedWeights ?? 0;
      if (sum < 1.0) {
        return `Cumulative verification weight must be at least 1.0 to mark fixed (current sum: ${sum.toFixed(2)})`;
      }
      return null;
    },
  },

  // 7. CLAIMED_FIXED -> DISPUTED (System, any single NOT_FIXED verification with weight >= 0.5)
  {
    from: [Status.CLAIMED_FIXED],
    action: "DISPUTE_FIX",
    to: () => Status.DISPUTED,
    allowedRoles: ["SYSTEM"],
    validate: (ctx) => {
      const weight = ctx.verification?.disputeWeight ?? 0;
      if (weight < 0.5) {
        return `Dispute verification weight must be at least 0.5 to dispute a claimed fix (got: ${weight.toFixed(2)})`;
      }
      return null;
    },
  },

  // 8. REJECTED -> OPEN (Desk, requires written reason for reopening)
  {
    from: [Status.REJECTED],
    action: "REOPEN",
    to: () => Status.OPEN,
    allowedRoles: ["AUTHORITY"],
    validate: (ctx) => {
      if (!ctx.note || ctx.note.trim().length === 0) {
        return "A written reason (note) is required to reopen a rejected issue";
      }
      return null;
    },
  },

  // 8b. VERIFIED_FIXED -> REOPENED_IN_WARRANTY (System when durability check fails during warranty)
  {
    from: [Status.VERIFIED_FIXED],
    action: "REOPEN_IN_WARRANTY",
    to: () => Status.REOPENED_IN_WARRANTY,
    allowedRoles: ["SYSTEM"],
  },

  // 9. Band Override (Desk, allowed in any non-terminal state, requires note)
  {
    from: [
      Status.OPEN,
      Status.CONFIRMED,
      Status.ASSIGNED,
      Status.IN_PROGRESS,
      Status.CLAIMED_FIXED,
      Status.DISPUTED,
      Status.REOPENED_IN_WARRANTY,
    ],
    action: "OVERRIDE_BAND",
    to: (from) => from,
    allowedRoles: ["AUTHORITY"],
    validate: (ctx) => {
      if (!ctx.note || ctx.note.trim().length === 0) {
        return "A written justification note is required to override the priority band";
      }
      if (!ctx.overrideBand) {
        return "A target priority band is required for override";
      }
      return null;
    },
  },
];

/**
 * Validates and executes an issue transition according to the PLAN.md Section 6 state machine.
 * Returns the new status, ActionLog creation payload, and Issue update fields.
 * Throws InvalidStateTransitionError on any disallowed or invalid transition.
 */
export function transition(
  issue: IssueStateInput,
  action: IssueAction,
  actor: StateMachineActor,
  context: TransitionContext = {}
): TransitionResult {
  // Find matching rule
  const rule = TRANSITION_RULES.find(
    (r) => r.action === action && r.from.includes(issue.status)
  );

  if (!rule) {
    throw new InvalidStateTransitionError(
      issue.status,
      action,
      `Action '${action}' is not permitted from status '${issue.status}'`
    );
  }

  // Check actor role
  if (!rule.allowedRoles.includes(actor.role)) {
    throw new InvalidStateTransitionError(
      issue.status,
      action,
      `Actor role '${actor.role}' is not authorized to perform action '${action}' (allowed: ${rule.allowedRoles.join(", ")})`
    );
  }

  // Validate context requirements
  if (rule.validate) {
    const validationError = rule.validate(context, issue.status);
    if (validationError) {
      throw new InvalidStateTransitionError(issue.status, action, validationError);
    }
  }

  const newStatus = rule.to(issue.status);

  const actionLogData: Prisma.ActionLogUncheckedCreateInput = {
    issueId: issue.id,
    actorId: actor.id,
    action: action as string,
    note: context.note,
    reportId: context.evidence?.reportId || context.verification?.reportId,
    fromStatus: issue.status,
    toStatus: newStatus,
  };

  const issueUpdateData: Prisma.IssueUncheckedUpdateInput = {};

  if (newStatus !== issue.status) {
    issueUpdateData.status = newStatus;
  }

  if (action === "ASSIGN_AGENCY" && context.agencyId) {
    issueUpdateData.agencyId = context.agencyId;
  } else if (action === "REASSIGN_AGENCY" && context.agencyId) {
    issueUpdateData.agencyId = context.agencyId;
    issueUpdateData.handoffCount = { increment: 1 };
  } else if (action === "OVERRIDE_BAND" && context.overrideBand) {
    issueUpdateData.bandOverride = context.overrideBand as Band;
    issueUpdateData.bandOverrideNote = context.note;
  }

  return {
    fromStatus: issue.status,
    toStatus: newStatus,
    action,
    actorId: actor.id,
    actionLogData,
    issueUpdateData,
  };
}

export function getAllowedActions(status: Status, role: ActorRole): IssueAction[] {
  const allowed = new Set<IssueAction>();
  for (const rule of TRANSITION_RULES) {
    if (rule.from.includes(status) && rule.allowedRoles.includes(role)) {
      allowed.add(rule.action);
    }
  }
  return Array.from(allowed);
}
