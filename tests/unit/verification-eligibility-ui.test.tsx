import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VerifyFixModal } from "@/components/public/VerifyFixModal";
import { getVerificationEligibility } from "@/lib/verification/eligibility";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe("Verification Eligibility Rules & UI", () => {
  const defaultIssueCoords = { lat: 12.9716, lng: 77.5946 };
  const issueId = "test-issue-123";
  const oldAccountDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  describe("getVerificationEligibility pure logic", () => {
    it("returns 'Not logged in' when user is not logged in", () => {
      const result = getVerificationEligibility({ isLoggedIn: false });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("Not logged in");
    });

    it("returns 'You reported this issue' when user is the original reporter", () => {
      const result = getVerificationEligibility({
        isLoggedIn: true,
        isReporter: true,
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("You reported this issue");
    });

    it("returns 'Already verified by you' when user already submitted verification", () => {
      const result = getVerificationEligibility({
        isLoggedIn: true,
        hasVerified: true,
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("Already verified by you");
    });

    it("returns 'Your account must be at least 24 hours old (eligible in X h)' when account < 24h old", () => {
      const fixedNow = 1_700_000_000_000;
      // Account created 6 hours ago -> 18 hours remaining
      const sixHoursOld = new Date(fixedNow - 6 * 3600 * 1000).toISOString();
      const result1 = getVerificationEligibility({
        isLoggedIn: true,
        accountCreatedAt: sixHoursOld,
        now: fixedNow,
      });
      expect(result1.eligible).toBe(false);
      expect(result1.reason).toBe("Your account must be at least 24 hours old (eligible in 18 h)");
      expect(result1.remainingHours).toBe(18);

      // Account created 23 hours and 30 mins ago -> 1 hour remaining
      const almostOldEnough = new Date(fixedNow - 23.5 * 3600 * 1000).toISOString();
      const result2 = getVerificationEligibility({
        isLoggedIn: true,
        accountCreatedAt: almostOldEnough,
        now: fixedNow,
      });
      expect(result2.eligible).toBe(false);
      expect(result2.reason).toBe("Your account must be at least 24 hours old (eligible in 1 h)");
      expect(result2.remainingHours).toBe(1);
    });

    it("returns 'You must be within 50 m of the issue' when distance > 50m", () => {
      const result = getVerificationEligibility({
        isLoggedIn: true,
        accountCreatedAt: oldAccountDate,
        distanceM: 75,
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("You must be within 50 m of the issue");
    });

    it("returns eligible: true when distance <= 50m and all rules pass", () => {
      const result = getVerificationEligibility({
        isLoggedIn: true,
        isReporter: false,
        hasVerified: false,
        accountCreatedAt: oldAccountDate,
        distanceM: 45,
      });
      expect(result.eligible).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("VerifyFixModal UI rendering for each eligibility condition", () => {
    it("1. shows 'Not logged in' and login link when user is logged out", () => {
      const html = renderToStaticMarkup(
        <VerifyFixModal
          issueId={issueId}
          issueCoords={defaultIssueCoords}
          isLoggedIn={false}
        />
      );

      expect(html).toContain('data-testid="verification-button-area"');
      expect(html).toContain('data-testid="verify-fix-button"');
      expect(html).toContain("disabled");
      expect(html).toContain('data-testid="verify-eligibility-reason"');
      expect(html).toContain("Not logged in");
      expect(html).toContain('data-testid="signin-to-verify-link"');
      expect(html).toContain(`/login?callbackUrl=/issue/${issueId}`);
    });

    it("2. shows 'You reported this issue' when user is the issue reporter", () => {
      const html = renderToStaticMarkup(
        <VerifyFixModal
          issueId={issueId}
          issueCoords={defaultIssueCoords}
          isLoggedIn={true}
          isReporter={true}
          accountCreatedAt={oldAccountDate}
        />
      );

      expect(html).toContain('data-testid="verification-button-area"');
      expect(html).toContain('data-testid="verify-fix-button"');
      expect(html).toContain("disabled");
      expect(html).toContain('data-testid="verify-eligibility-reason"');
      expect(html).toContain("You reported this issue");
    });

    it("3. shows 'Your account must be at least 24 hours old (eligible in X h)' when account is new", () => {
      const fiveHoursOld = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
      const html = renderToStaticMarkup(
        <VerifyFixModal
          issueId={issueId}
          issueCoords={defaultIssueCoords}
          isLoggedIn={true}
          isReporter={false}
          accountCreatedAt={fiveHoursOld}
        />
      );

      expect(html).toContain('data-testid="verification-button-area"');
      expect(html).toContain('data-testid="verify-fix-button"');
      expect(html).toContain("disabled");
      expect(html).toContain('data-testid="verify-eligibility-reason"');
      expect(html).toContain("Your account must be at least 24 hours old (eligible in 19 h)");
    });

    it("4. shows 'Already verified by you' when user has already verified this issue", () => {
      const html = renderToStaticMarkup(
        <VerifyFixModal
          issueId={issueId}
          issueCoords={defaultIssueCoords}
          isLoggedIn={true}
          isReporter={false}
          hasVerified={true}
          accountCreatedAt={oldAccountDate}
        />
      );

      expect(html).toContain('data-testid="verification-button-area"');
      expect(html).toContain('data-testid="verify-fix-button"');
      expect(html).toContain("disabled");
      expect(html).toContain('data-testid="verify-eligibility-reason"');
      expect(html).toContain("Already verified by you");
    });

    it("5. shows 'You must be within 50 m of the issue' when user is > 50 m away", () => {
      const html = renderToStaticMarkup(
        <VerifyFixModal
          issueId={issueId}
          issueCoords={defaultIssueCoords}
          isLoggedIn={true}
          isReporter={false}
          hasVerified={false}
          accountCreatedAt={oldAccountDate}
          initialDistanceM={180}
        />
      );

      expect(html).toContain('data-testid="verification-button-area"');
      expect(html).toContain('data-testid="verify-fix-button"');
      expect(html).toContain("disabled");
      expect(html).toContain('data-testid="verify-eligibility-reason"');
      expect(html).toContain("You must be within 50 m of the issue");
    });

    it("6. shows active enabled 'Verify this fix (+20 XP)' button when citizen is eligible", () => {
      const html = renderToStaticMarkup(
        <VerifyFixModal
          issueId={issueId}
          issueCoords={defaultIssueCoords}
          isLoggedIn={true}
          isReporter={false}
          hasVerified={false}
          accountCreatedAt={oldAccountDate}
          initialDistanceM={20}
        />
      );

      expect(html).toContain('data-testid="verification-button-area"');
      expect(html).toContain('data-testid="verify-fix-button"');
      expect(html).not.toContain("disabled");
      expect(html).not.toContain('data-testid="verify-eligibility-reason"');
      expect(html).toContain("Verify this fix (+20 XP)");
    });
  });
});
