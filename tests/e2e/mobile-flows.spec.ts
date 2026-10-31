import { test, expect } from '@playwright/test';
import { createSeedDb } from '../../scripts/lib/db-target';
import { Status, Band, Category } from '@prisma/client';
import { seedDemoData } from '../../scripts/seed-demo';

// Always the isolated test schema; fails fast instead of falling back to production.
const { pool, prisma, verify: verifyTestDb } = createSeedDb();
test.beforeAll(async () => {
  await verifyTestDb();
});

const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe('Mobile Viewport E2E: Desk Actions & Mobile Logout Flows', () => {
  const testIssueIds: string[] = [];

  test.beforeAll(async () => {
    await seedDemoData();
  });

  test.afterAll(async () => {
    if (testIssueIds.length > 0) {
      await prisma.actionLog.deleteMany({
        where: { issueId: { in: testIssueIds } },
      }).catch(() => {});
      await prisma.report.deleteMany({
        where: { issueId: { in: testIssueIds } },
      }).catch(() => {});
      await prisma.issue.deleteMany({
        where: { id: { in: testIssueIds } },
      }).catch(() => {});
    }
    await pool.end().catch(() => {});
  });

  test.use({
    viewport: MOBILE_VIEWPORT,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  test('Desk logs in on mobile, opens /desk, confirms an issue via IssueDrawer and sees it logged, then logs out', async ({ page }) => {
    // 1. Create a dedicated OPEN test issue
    const agency = await prisma.agency.findFirstOrThrow({ where: { code: 'GBA' } });

    const issueId = `mobile-test-issue-${Date.now()}`;
    testIssueIds.push(issueId);

    const testIssue = await prisma.issue.create({
      data: {
        id: issueId,
        category: Category.POTHOLES,
        status: Status.OPEN,
        lat: 12.9354,
        lng: 77.6251,
        address: 'Koramangala 80ft Road Junction',
        priority: 75.0,
        band: Band.HIGH,
        agencyId: agency.id,
        isSeed: true,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });

    // 2. Desk logs in on mobile viewport
    await page.goto('/login');
    await page.fill('input[type="email"]', 'desk-a@civicpulse.local');
    await page.fill('input[type="password"]', seedPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes('/desk'), { timeout: 15000 });

    // 3. Find and open the created issue in the desk queue
    const issueRow = page.locator(`text=${testIssue.address}`).first();
    await expect(issueRow).toBeVisible({ timeout: 15000 });
    await issueRow.click();

    // 4. Drawer opens: confirm the issue
    const confirmButton = page.locator('button:has-text("Confirm Issue")');
    await expect(confirmButton).toBeVisible({ timeout: 10000 });
    await confirmButton.click();

    // 5. Verify status updates to CONFIRMED and action is logged in audit trail
    await expect(page.locator('span:has-text("CONFIRMED")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('span:has-text("CONFIRM")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pl-8 span.text-cyan-300').first()).toBeVisible({ timeout: 10000 });

    // 6. Verify seed badge is visible
    const seedTag = page.locator('[data-testid="seed-tag"]').first();
    await expect(seedTag).toBeVisible();

    // 7. Close drawer and desk logs out via mobile desk header
    await page.locator('[data-testid="close-drawer-button"]').click();
    await expect(page.locator('[data-testid="close-drawer-button"]')).not.toBeVisible();

    const deskLogoutBtn = page.locator('[data-testid="desk-logout-button"], button:has-text("Log out")').first();
    await expect(deskLogoutBtn).toBeVisible();
    await deskLogoutBtn.click();
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
  });

  test('Citizen logs in on mobile, views profile, and logs out', async ({ page }) => {
    // 1. Citizen logs in on mobile viewport
    await page.goto('/login');
    await page.fill('input[type="email"]', 'citizen@example.com');
    await page.fill('input[type="password"]', seedPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes('/citizen/dashboard'), { timeout: 15000 });

    // 2. Open citizen profile
    await page.goto('/citizen/profile');
    await page.waitForLoadState('domcontentloaded');

    // 3. Verify profile page rendered and log out via profile logout button
    const profileLogoutBtn = page.locator('[data-testid="citizen-logout-button"], [data-testid="logout-button"]').first();
    await expect(profileLogoutBtn).toBeVisible({ timeout: 10000 });
    await profileLogoutBtn.click();

    // 4. Verifies redirected to /login
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });
});
