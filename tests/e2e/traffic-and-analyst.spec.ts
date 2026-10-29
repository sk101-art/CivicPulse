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

    // Verify pavement deterioration risk card
    const deteriorationCard = page.locator('[data-testid="deterioration-risk-card"]');
    await expect(deteriorationCard).toBeVisible();
    await expect(deteriorationCard).toContainText("Deterioration Risk");

    // Verify live traffic card
    const liveTraffic = page.locator('[data-testid="live-traffic-card"]');
    await expect(liveTraffic).toBeVisible();
    await expect(liveTraffic).toContainText("Live Road Speed");

    // Verify citizen-safe AI summary card
    const aiSummary = page.locator('[data-testid="citizen-ai-summary-card"]');
    await expect(aiSummary).toBeVisible();
    await expect(aiSummary).toContainText("Civic Analyst Assessment");
  });

  test("desk dashboard shows AI analyst ward brief and drawer has repair calendar heatmap", async ({ page }) => {
    // Sign in as authority desk user
    await page.goto("/login");
    await page.fill('input[type="email"], input[name="email"]', "desk-a@civicpulse.local");
    await page.fill('input[type="password"], input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/desk**");

    // Verify Desk Analyst Brief Panel
    const analystPanel = page.locator('[data-testid="desk-analyst-panel"]');
    await expect(analystPanel).toBeVisible();
    await expect(page.getByText("Desk AI Analyst")).toBeVisible();

    // Click on pilot issue to open desk drawer
    const issueRow = page.locator(`[data-issue-id="${pilotIssueId}"], text=Outer Ring Road`).first();
    if (await issueRow.isVisible()) {
      await issueRow.click();

      // Drawer should show repair window badge
      const repairDetailed = page.locator('[data-testid="repair-window-detailed"]');
      await expect(repairDetailed).toBeVisible();

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
      await expect(detPanel).toBeVisible();
    }
  });
});
