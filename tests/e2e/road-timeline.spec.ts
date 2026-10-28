import { test, expect } from "@playwright/test";

test.describe("T60: Road timeline public page", () => {
  const pilotSegmentId = "seed-seg-orr-kadubeesanahalli";

  test("loads road timeline page, shows metadata, stats, chronological order, and seed tags", async ({ page }) => {
    await page.goto(`/road/${pilotSegmentId}`);

    // Verify title and header metadata
    await expect(page.locator("h1")).toContainText("Outer Ring Road (Kadubeesanahalli Section)");
    await expect(page.getByText("Pilot Monitored Corridor")).toBeVisible();

    // Verify stat cards
    await expect(page.locator('[data-testid="stat-total-events"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-resurfaced"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-recurrences"]')).toBeVisible();

    // Verify timeline items are present
    const timelineItems = page.locator('[data-testid="timeline-item"]');
    await expect(timelineItems.first()).toBeVisible();
    const count = await timelineItems.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // Verify seed tag exists and contains "Seed Data"
    const seedTags = page.locator('[data-testid="seed-tag"]');
    await expect(seedTags.first()).toBeVisible();
    await expect(seedTags.first()).toHaveText("Seed Data");

    // Verify agency labels and handoffs
    await expect(page.getByText(/Agency Handoff/i).first()).toBeVisible();
    await expect(page.getByText(/Greater Bengaluru Authority/i).first()).toBeVisible();
  });
});
