import { test, expect } from "@playwright/test";

test.describe("T70: PWA Installability and Static Shell", () => {
  test("serves manifest.json and links it in page head", async ({ page, request }) => {
    // 1. Check HTTP response for /manifest.json
    const manifestRes = await request.get("/manifest.json");
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.short_name).toBe("CivicPulse");
    expect(manifest.display).toBe("standalone");

    // 2. Check HTTP response for offline page and icon
    const offlineRes = await request.get("/offline.html");
    expect(offlineRes.status()).toBe(200);

    const iconRes = await request.get("/icons/icon-192x192.png");
    expect(iconRes.status()).toBe(200);

    // 3. Visit homepage and verify manifest link in HTML head
    await page.goto("/");
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute("href", "/manifest.json");
  });
});
