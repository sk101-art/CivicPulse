import { describe, it, expect } from "vitest";
import {
  transition,
  InvalidStateTransitionError,
  type StateMachineActor,
  type IssueStateInput,
  type TransitionContext,
  type IssueAction,
} from "@/lib/issues/stateMachine";
import { Status } from "@prisma/client";

describe("T24 Acceptance: Issue state machine", () => {
  const deskActor: StateMachineActor = { id: "desk-officer-1", role: "AUTHORITY" };
  const systemActor: StateMachineActor = { id: "system-verifier", role: "SYSTEM" };
  const citizenActor: StateMachineActor = { id: "citizen-1", role: "CITIZEN" };

  const sampleIssue = (status: Status): IssueStateInput => ({
    id: "issue-state-machine-test",
    status,
    agencyId: "agency-bbmp",
    handoffCount: 0,
  });

  describe("Table-driven tests: Every allowed transition passes", () => {
    interface AllowedTestCase {
      name: string;
      from: Status;
      action: IssueAction;
      actor: StateMachineActor;
      context: TransitionContext;
      expectedTo: Status;
    }

    const allowedTransitions: AllowedTestCase[] = [
      {
        name: "OPEN -> CONFIRM -> CONFIRMED",
        from: Status.OPEN,
        action: "CONFIRM",
        actor: deskActor,
        context: {},
        expectedTo: Status.CONFIRMED,
      },
      {
        name: "OPEN -> REJECT (with note) -> REJECTED",
        from: Status.OPEN,
        action: "REJECT",
        actor: deskActor,
        context: { note: "Duplicate report already being resolved" },
        expectedTo: Status.REJECTED,
      },
      {
        name: "CONFIRMED -> ASSIGN_AGENCY (with agencyId) -> ASSIGNED",
        from: Status.CONFIRMED,
        action: "ASSIGN_AGENCY",
        actor: deskActor,
        context: { agencyId: "agency-bwssb" },
        expectedTo: Status.ASSIGNED,
      },
      {
        name: "ASSIGNED -> START_WORK -> IN_PROGRESS",
        from: Status.ASSIGNED,
        action: "START_WORK",
        actor: deskActor,
        context: {},
        expectedTo: Status.IN_PROGRESS,
      },
      {
        name: "CONFIRMED -> CLAIM_FIX (signed photo <=50m) -> CLAIMED_FIXED",
        from: Status.CONFIRMED,
        action: "CLAIM_FIX",
        actor: deskActor,
        context: {
          evidence: { role: "CLAIM_FIX", distanceM: 15, reportId: "claim-rep-1" },
        },
        expectedTo: Status.CLAIMED_FIXED,
      },
      {
        name: "ASSIGNED -> CLAIM_FIX (signed photo <=50m) -> CLAIMED_FIXED",
        from: Status.ASSIGNED,
        action: "CLAIM_FIX",
        actor: deskActor,
        context: {
          evidence: { role: "CLAIM_FIX", distanceM: 25, reportId: "claim-rep-2" },
        },
        expectedTo: Status.CLAIMED_FIXED,
      },
      {
        name: "IN_PROGRESS -> CLAIM_FIX (signed photo <=50m) -> CLAIMED_FIXED",
        from: Status.IN_PROGRESS,
        action: "CLAIM_FIX",
        actor: deskActor,
        context: {
          evidence: { role: "CLAIM_FIX", distanceM: 10, reportId: "claim-rep-3" },
        },
        expectedTo: Status.CLAIMED_FIXED,
      },
      {
        name: "CLAIMED_FIXED -> VERIFY_FIX (sum weights >= 1.0) -> VERIFIED_FIXED",
        from: Status.CLAIMED_FIXED,
        action: "VERIFY_FIX",
        actor: systemActor,
        context: { verification: { sumFixedWeights: 1.0, reportId: "verify-rep-1" } },
        expectedTo: Status.VERIFIED_FIXED,
      },
      {
        name: "CLAIMED_FIXED -> DISPUTE_FIX (weight >= 0.5) -> DISPUTED",
        from: Status.CLAIMED_FIXED,
        action: "DISPUTE_FIX",
        actor: systemActor,
        context: { verification: { disputeWeight: 0.55, reportId: "dispute-rep-1" } },
        expectedTo: Status.DISPUTED,
      },
      {
        name: "DISPUTED -> START_WORK -> IN_PROGRESS",
        from: Status.DISPUTED,
        action: "START_WORK",
        actor: deskActor,
        context: {},
        expectedTo: Status.IN_PROGRESS,
      },
      {
        name: "DISPUTED -> CLAIM_FIX (signed photo <=50m) -> CLAIMED_FIXED",
        from: Status.DISPUTED,
        action: "CLAIM_FIX",
        actor: deskActor,
        context: {
          evidence: { role: "CLAIM_FIX", distanceM: 5, reportId: "claim-rep-4" },
        },
        expectedTo: Status.CLAIMED_FIXED,
      },
      {
        name: "REJECTED -> REOPEN (with written reason) -> OPEN",
        from: Status.REJECTED,
        action: "REOPEN",
        actor: deskActor,
        context: { note: "Reopening after citizen appeal and site inspection" },
        expectedTo: Status.OPEN,
      },
      {
        name: "ASSIGNED -> REASSIGN_AGENCY (with agencyId) -> ASSIGNED with handoff increment",
        from: Status.ASSIGNED,
        action: "REASSIGN_AGENCY",
        actor: deskActor,
        context: { agencyId: "agency-bescom" },
        expectedTo: Status.ASSIGNED,
      },
    ];

    allowedTransitions.forEach((tc) => {
      it(tc.name, () => {
        const result = transition(sampleIssue(tc.from), tc.action, tc.actor, tc.context);
        expect(result.fromStatus).toBe(tc.from);
        expect(result.toStatus).toBe(tc.expectedTo);
        expect(result.action).toBe(tc.action);
        expect(result.actorId).toBe(tc.actor.id);
        expect(result.actionLogData.action).toBe(tc.action);
        expect(result.actionLogData.toStatus).toBe(tc.expectedTo);
      });
    });
  });

  describe("Disallowed transitions throw InvalidStateTransitionError (Sample of 12)", () => {
    interface DisallowedCase {
      description: string;
      from: Status;
      action: IssueAction;
      actor: StateMachineActor;
      context?: TransitionContext;
    }

    const disallowedCases: DisallowedCase[] = [
      {
        description: "1. OPEN cannot START_WORK directly",
        from: Status.OPEN,
        action: "START_WORK",
        actor: deskActor,
      },
      {
        description: "2. OPEN cannot CLAIM_FIX without confirmation or work",
        from: Status.OPEN,
        action: "CLAIM_FIX",
        actor: deskActor,
        context: { evidence: { role: "CLAIM_FIX", distanceM: 10 } },
      },
      {
        description: "3. OPEN cannot VERIFY_FIX",
        from: Status.OPEN,
        action: "VERIFY_FIX",
        actor: systemActor,
        context: { verification: { sumFixedWeights: 1.5 } },
      },
      {
        description: "4. CONFIRMED cannot START_WORK before assignment",
        from: Status.CONFIRMED,
        action: "START_WORK",
        actor: deskActor,
      },
      {
        description: "5. CONFIRMED cannot REJECT (already confirmed)",
        from: Status.CONFIRMED,
        action: "REJECT",
        actor: deskActor,
        context: { note: "Attempt late rejection" },
      },
      {
        description: "6. VERIFIED_FIXED cannot REOPEN (closed issues are never reopened)",
        from: Status.VERIFIED_FIXED,
        action: "REOPEN",
        actor: deskActor,
        context: { note: "Trying to reopen verified fixed" },
      },
      {
        description: "7. VERIFIED_FIXED cannot CLAIM_FIX",
        from: Status.VERIFIED_FIXED,
        action: "CLAIM_FIX",
        actor: deskActor,
        context: { evidence: { role: "CLAIM_FIX", distanceM: 5 } },
      },
      {
        description: "8. VERIFIED_FIXED cannot START_WORK",
        from: Status.VERIFIED_FIXED,
        action: "START_WORK",
        actor: deskActor,
      },
      {
        description: "9. CLAIMED_FIXED cannot START_WORK while awaiting citizen verification",
        from: Status.CLAIMED_FIXED,
        action: "START_WORK",
        actor: deskActor,
      },
      {
        description: "10. REJECTED cannot CONFIRM without reopening first",
        from: Status.REJECTED,
        action: "CONFIRM",
        actor: deskActor,
      },
      {
        description: "11. CITIZEN actor cannot execute desk action CONFIRM",
        from: Status.OPEN,
        action: "CONFIRM",
        actor: citizenActor,
      },
      {
        description: "12. CLAIM_FIX with distance > 50m throws validation error",
        from: Status.IN_PROGRESS,
        action: "CLAIM_FIX",
        actor: deskActor,
        context: { evidence: { role: "CLAIM_FIX", distanceM: 75 } },
      },
    ];

    disallowedCases.forEach((tc) => {
      it(tc.description, () => {
        expect(() =>
          transition(sampleIssue(tc.from), tc.action, tc.actor, tc.context)
        ).toThrow(InvalidStateTransitionError);
      });
    });
  });

  describe("Validation of required contexts", () => {
    it("REJECT requires non-empty note", () => {
      expect(() =>
        transition(sampleIssue(Status.OPEN), "REJECT", deskActor, { note: "" })
      ).toThrow(InvalidStateTransitionError);
    });

    it("ASSIGN_AGENCY requires non-empty agencyId", () => {
      expect(() =>
        transition(sampleIssue(Status.CONFIRMED), "ASSIGN_AGENCY", deskActor, {})
      ).toThrow(InvalidStateTransitionError);
    });

    it("VERIFY_FIX requires cumulative sum >= 1.0", () => {
      expect(() =>
        transition(sampleIssue(Status.CLAIMED_FIXED), "VERIFY_FIX", systemActor, {
          verification: { sumFixedWeights: 0.95 },
        })
      ).toThrow(InvalidStateTransitionError);
    });

    it("DISPUTE_FIX requires dispute weight >= 0.5", () => {
      expect(() =>
        transition(sampleIssue(Status.CLAIMED_FIXED), "DISPUTE_FIX", systemActor, {
          verification: { disputeWeight: 0.4 },
        })
      ).toThrow(InvalidStateTransitionError);
    });
  });
});
