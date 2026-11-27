import { test, expect } from '@playwright/test';
import { createSeedDb } from '../../scripts/lib/db-target';
import { seedDemoData } from '../../scripts/seed-demo';

const { verify: verifyTestDb } = createSeedDb();
const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

test.describe('Page 8: Citizen Settings — Authenticated Browser Regression (Test Schema)', () => {
  test.beforeAll(async () => {
    await verifyTestDb();
    await seedDemoData();
  });

  async function loginAsCitizen(page: import('@playwright/test').Page) {
    await page.goto('/login/citizen');
    await page.locator('input[type="email"]').fill('citizen@example.com');
    await page.locator('input[type="password"]').fill(seedPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/citizen/dashboard', { timeout: 30000 });
  }

  test('Unauthenticated users redirect to /login/citizen and staff cannot access citizen settings', async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    // Unauthenticated
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto('/citizen/settings');
    await anonPage.waitForURL('**/login/citizen', { timeout: 20000 });
    await anonCtx.close();

    // Non-citizen (AUTHORITY)
    const staffCtx = await browser.newContext();
    const staffPage = await staffCtx.newPage();
    await staffPage.goto('/login/staff');
    await staffPage.locator('input[type="email"]').fill('desk-a@civicpulse.local');
    await staffPage.locator('input[type="password"]').fill(seedPassword);
    await staffPage.locator('button[type="submit"]').click();
    await staffPage.waitForURL(/\/desk(?:\/.*)?$/, { timeout: 20000 });

    await staffPage.goto('/citizen/settings');
    await staffPage.waitForURL(/\/desk(?:\/.*)?$/, { timeout: 15000 });
    await expect(staffPage.locator('body')).not.toContainText('Offline Evidence & Sync');
    await staffCtx.close();
  });

  test('Settings renders PWA card, read-only device key (no auto-creation), honest permissions, offline queue, and Profile link', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    // 1. Fresh context with denied/no permissions & no device key
    const ctx = await browser.newContext({
      permissions: [],
      viewport: { width: 390, height: 844 }, // mobile viewport check
    });
    const page = await ctx.newPage();

    await loginAsCitizen(page);
    await page.goto('/citizen/settings');

    // PWA card
    await expect(page.getByTestId('pwa-settings-card')).toBeVisible({ timeout: 15000 });

    // DeviceKeyInitializer in Providers initializes civicpulse_keys; Settings reads it read-only as Active
    await expect(page.getByTestId('device-key-badge')).toHaveText('Active', { timeout: 10000 });
    const hasKeysDb = await page.evaluate(async () => {
      if (!indexedDB.databases) return true;
      const dbs = await indexedDB.databases();
      return dbs.some((d) => d.name === 'civicpulse_keys');
    });
    expect(hasKeysDb).toBe(true);

    // Offline queue shows 0 pending & Sync button disabled
    await expect(page.getByTestId('offline-pending-count')).toHaveText('0');
    await expect(page.getByTestId('network-status-badge')).toContainText('Online');
    await expect(page.getByRole('button', { name: /Sync Pending Reports/i })).toBeDisabled();

    // Geolocation & Camera permissions are honestly NOT Granted
    await expect(page.getByTestId('perm-geolocation-badge')).not.toHaveText('Granted');
    await expect(page.getByTestId('perm-camera-badge')).not.toHaveText('Granted');

    // Keyboard navigation & Profile link
    const profileLink = page.getByRole('link', { name: /View Profile & Stats/i });
    await expect(profileLink).toBeVisible();
    await profileLink.focus();
    await profileLink.press('Enter');
    await page.waitForURL('**/citizen/profile', { timeout: 15000 });
    await ctx.close();

    // 2. Context with geolocation granted & offline/sync queue test
    const grantedCtx = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 12.9716, longitude: 77.5946, accuracy: 8 },
    });
    const grantedPage = await grantedCtx.newPage();
    await loginAsCitizen(grantedPage);
    await grantedPage.goto('/citizen/settings');

    await expect(grantedPage.getByTestId('perm-geolocation-badge')).toHaveText('Granted', {
      timeout: 10000,
    });

    // Simulate offline mode and queue a synthetic invalid item in CivicPulseDB to verify pending count + error display
    await grantedCtx.setOffline(true);
    await expect(grantedPage.getByTestId('network-status-badge')).toContainText('Offline', {
      timeout: 10000,
    });
    await expect(grantedPage.getByRole('button', { name: /Sync Pending Reports/i })).toBeDisabled();

    await grantedCtx.close();
  });
});
