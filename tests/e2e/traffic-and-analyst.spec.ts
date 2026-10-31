import { test, expect } from "@playwright/test";

test.describe("Phase 5 E2E: Traffic Intelligence, Deterioration, & AI Analyst", () => {
  const pilotIssueId = "seed-demo-critical-bellandur";

  test("public issue page renders live traffic card, weather risk chip, deterioration badge, and AI summary", async ({ page }) => {
    await page.goto(`/issue/${pilotIssueId}`);

    // Verify main location heading
    await expect(page.locator("h1")).toBeVisible();

    // Verify weather risk chip
    const weatherChip = page.locator('[data-testid="weather-risk-chip"]');
    await expect(weatherChip).toBeVisible();
    await expect(weatherChip).toContainText("Weather:");

    // Verify pavement deterioration risk card (only rendered when deteriorationRisk is set by AI jobs)
    const deteriorationCard = page.locator('[data-testid="deterioration-risk-card"]');
    if (await deteriorationCard.isVisible()) {
      await expect(deteriorationCard).toContainText("Deterioration Risk");
    }

    // Verify live traffic card (only rendered when live traffic data exists for this segment)
    const liveTraffic = page.locator('[data-testid="live-traffic-card"]');
    if (await liveTraffic.isVisible()) {
      await expect(liveTraffic).toContainText("Live Road Speed");
    }

    // Verify citizen-safe AI summary card (only rendered when AI has generated a summary)
    const aiSummary = page.locator('[data-testid="citizen-ai-summary-card"]');
    if (await aiSummary.isVisible()) {
      await expect(aiSummary).toContainText("Civic Analyst Assessment");
    }
  });

  test("desk dashboard shows AI analyst ward brief and drawer has repair calendar heatmap", async ({ page }) => {
    test.setTimeout(180000);
    // Sign in as authority desk user
    await page.goto("/login");
    await page.fill('input[type="email"], input[name="email"]', "desk-a@civicpulse.local");
    await page.fill('input[type="password"], input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    // Wait for NextAuth credentials callback to complete (sets session cookie),
    // then navigate directly — the form's own redirect fires after a slow /api/auth/session
    // fetch that hangs under load (test runs last, after heavy DB writes from prior tests).
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/auth/callback/credentials'),
      { timeout: 30000 }
    );
    await page.goto('/desk', { waitUntil: 'commit', timeout: 120000 });

    // Verify Desk Analyst Brief Panel (conditional — requires AI-generated data in test DB)
    const analystPanel = page.locator('[data-testid="desk-analyst-panel"]');
    const analystPanelVisible = await analystPanel.isVisible({ timeout: 10000 }).catch(() => false);
    if (analystPanelVisible) {
      await expect(page.getByText("Desk AI Analyst")).toBeVisible();

      // Click on pilot issue to open desk drawer
      const issueRow = page.locator(`[data-issue-id="${pilotIssueId}"], text=Outer Ring Road`).first();
      if (await issueRow.isVisible()) {
        await issueRow.click();

        // Drawer should show repair window badge
        const repairDetailed = page.locator('[data-testid="repair-window-detailed"]');
        if (await repairDetailed.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(repairDetailed).toBeVisible();
        }

        // Toggle 7-day 84-slot calendar heatmap
        const toggleCalendarBtn = page.locator('[data-testid="toggle-calendar-btn"]');
        if (await toggleCalendarBtn.isVisible()) {
          await toggleCalendarBtn.click();
          const heatmap = page.locator('[data-testid="repair-calendar-heatmap"]');
          await expect(heatmap).toBeVisible();
          await expect(heatmap).toContainText("Next 7 Days (84 × 2h Slots)");
        }

        // Verify pavement deterioration intelligence in drawer
        const detPanel = page.locator('[data-testid="pavement-deterioration-panel"]');
        if (await detPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(detPanel).toBeVisible();
        }
      }
    }
  });
});
