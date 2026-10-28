import { test, expect } from "@playwright/test";

const seedPassword = process.env.SEED_DESK_PASSWORD || "password123";

test.describe("T46: Map Layers Acceptance E2E", () => {
  test("toggles issues and live traffic layers without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Log in as citizen first
    await page.goto("/login");
    await page.fill('input[type="email"]', "citizen@example.com");
    await page.fill('input[type="password"]', seedPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => url.pathname.includes("/citizen/dashboard"), {
      timeout: 15000,
    });

    // Navigate to citizen map
    await page.goto("/citizen/map");
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });

    // Wait for the map container to be visible
    const map = page.locator(".leaflet-container");
    await expect(map).toBeVisible({ timeout: 10000 });

    // Open Layer Control dropdown
    const layerBtn = page.locator('button[aria-label="Map Layers"]');
    await expect(layerBtn).toBeVisible({ timeout: 5000 });
    await layerBtn.click();

    // Verify dropdown overlay options are rendered
    await expect(page.getByText("Map Overlays")).toBeVisible();
    await expect(page.getByText("Issues (Bands)")).toBeVisible();
    await expect(page.getByText("Live Traffic")).toBeVisible();

    // Toggle Live Traffic ON
    const trafficCheckbox = page.locator('input[type="checkbox"]').nth(1);
    await trafficCheckbox.check();
    await page.waitForTimeout(500);

    // Verify keys-later notice or traffic flow mounts without errors
    expect(consoleErrors.filter((e) => !e.includes("no-img-element"))).toHaveLength(0);

    // Toggle Issues Layer OFF
    const issuesCheckbox = page.locator('input[type="checkbox"]').nth(0);
    await issuesCheckbox.uncheck();
    await page.waitForTimeout(500);

    // Toggle Issues Layer back ON
    await issuesCheckbox.check();
    await page.waitForTimeout(500);

    // Ensure zero console errors occurred throughout layer toggling
    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("404") &&
        !e.includes("Download the React DevTools")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
