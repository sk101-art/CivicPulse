import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  calculatePoints,
  calculateTier,
  POINT_VALUES,
} from "@/lib/points";
import { Tier } from "@prisma/client";

describe("T15 Acceptance: Points and XP Rules; Remove Votes", () => {
  it("rule: new Issue +10 points", () => {
    const points = calculatePoints({ event: "NEW_ISSUE" });
    expect(points).toBe(10);
    expect(POINT_VALUES.NEW_ISSUE).toBe(10);
  });

  it("rule: confirmation of someone else's issue +5 points", () => {
    const points = calculatePoints({ event: "CONFIRMATION", isOwnIssue: false });
    expect(points).toBe(5);
    expect(POINT_VALUES.CONFIRMATION).toBe(5);
  });

  it("rule: confirmation of own issue earns 0 points", () => {
    const points = calculatePoints({ event: "CONFIRMATION", isOwnIssue: true });
    expect(points).toBe(0);
  });

  it("rule: accepted verification +20 points", () => {
    const points = calculatePoints({ event: "VERIFICATION_ACCEPTED" });
    expect(points).toBe(20);
    expect(POINT_VALUES.VERIFICATION_ACCEPTED).toBe(20);
  });

  it("rule: verification that later proves wrong −20 points", () => {
    const points = calculatePoints({ event: "VERIFICATION_WRONG" });
    expect(points).toBe(-20);
    expect(POINT_VALUES.VERIFICATION_WRONG).toBe(-20);
  });

  it("rule: merged duplicate earns 0 points", () => {
    const points = calculatePoints({ event: "DUPLICATE_MERGE" });
    expect(points).toBe(0);
    expect(POINT_VALUES.DUPLICATE_MERGE).toBe(0);
  });

  it("calculates tiers correctly based on reputation thresholds", () => {
    expect(calculateTier(0)).toBe(Tier.CITIZEN);
    expect(calculateTier(199)).toBe(Tier.CITIZEN);
    expect(calculateTier(200)).toBe(Tier.CONTRIBUTOR);
    expect(calculateTier(499)).toBe(Tier.CONTRIBUTOR);
    expect(calculateTier(500)).toBe(Tier.GUARDIAN);
    expect(calculateTier(999)).toBe(Tier.GUARDIAN);
    expect(calculateTier(1000)).toBe(Tier.AMBASSADOR);
    expect(calculateTier(2500)).toBe(Tier.AMBASSADOR);
  });

  it("acceptance: no route exists under /vote", () => {
    const rootDir = process.cwd();
    const voteRoutePath = path.join(
      rootDir,
      "src",
      "app",
      "api",
      "reports",
      "[id]",
      "vote",
      "route.ts"
    );
    expect(fs.existsSync(voteRoutePath)).toBe(false);

    const voteDirPath = path.join(
      rootDir,
      "src",
      "app",
      "api",
      "reports",
      "[id]",
      "vote"
    );
    expect(fs.existsSync(voteDirPath)).toBe(false);
  });
});
