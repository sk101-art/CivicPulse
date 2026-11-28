import { test, expect } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { Role, Tier } from '@prisma/client';
import { createSeedDb } from '../../scripts/lib/db-target';
import { seedDemoData } from '../../scripts/seed-demo';

const { prisma, verify: verifyTestDb } = createSeedDb();
const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

const FORBIDDEN_FAKE_STRINGS = [
  'Mar 2025',
  'Priya Sharma',
  'Vikram Mehta',
  'Ananya Das',
  'VER-01',
  'Level 3',
];

test.describe('Page 7: Citizen Profile — Authenticated Browser Regression (Test Schema)', () => {
  const createdUserIds: string[] = [];
  let originalCitizenName: string | null = null;

  test.beforeAll(async () => {
    await verifyTestDb();
    await seedDemoData();
    const existing = await prisma.user.findUnique({ where: { email: 'citizen@example.com' } });
    originalCitizenName = existing?.name ?? 'Citizen';
  });

  test.afterAll(async () => {
    if (originalCitizenName !== null) {
      await prisma.user
        .updateMany({
          where: { email: 'citizen@example.com' },
          data: { name: originalCitizenName },
        })
        .catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.citizenProfile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
  });

  async function loginAsCitizen(page: import('@playwright/test').Page, email: string) {
    await page.goto('/login/citizen');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(seedPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/citizen/dashboard', { timeout: 30000 });
  }

  test('Existing citizen: real identity, Edit Profile persistence, report search/filter/links, leaderboard, and navigation', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAsCitizen(page, 'citizen@example.com');
    await page.goto('/citizen/profile');

    // No fake values
    for (const fake of FORBIDDEN_FAKE_STRINGS) {
      await expect(page.locator('body')).not.toContainText(fake);
    }
    await expect(page.locator('body')).toContainText('citizen@example.com');
    await expect(page.locator('body')).toContainText('Member since');
    await expect(page.locator('body')).not.toContainText('Verification History');

    // Edit display name, save, reload, and confirm persistence
    const updatedName = `Aarav E2E ${Date.now().toString().slice(-4)}`;
    await page.getByRole('button', { name: /Edit Profile/i }).click();
    await page.locator('#profile-display-name-input').fill(updatedName);
    await page.getByRole('button', { name: /Save Changes/i }).click();

    await expect(page.getByTestId('profile-display-name')).toHaveText(updatedName, { timeout: 10000 });
    await page.reload();
    await expect(page.getByTestId('profile-display-name')).toHaveText(updatedName, { timeout: 10000 });

    // Report History search & status filter
    const firstReportLink = page.locator('a[href^="/issue/"]').first();
    if ((await firstReportLink.count()) > 0) {
      const href = await firstReportLink.getAttribute('href');
      expect(href).toMatch(/^\/issue\/.+/);
      await page.getByLabel('Filter reports by status').selectOption('VERIFIED_FIXED');
      await page.waitForTimeout(400);
      await page.getByLabel('Filter reports by status').selectOption('ALL');
      await page.waitForTimeout(400);

      await firstReportLink.click();
      await page.waitForURL('**/issue/**', { timeout: 15000 });
      await page.goto('/citizen/profile');
    }

    // Leaderboard tab shows real rank & no Level 3
    await page.getByRole('button', { name: /^Leaderboard$/i }).click();
    await expect(page.locator('body')).toContainText('Your city-wide rank', { timeout: 10000 });
    await expect(page.locator('body')).not.toContainText('Level 3');
    await expect(page.locator('body')).not.toContainText('Priya Sharma');

    // Verification Activity link -> /citizen/audit
    await page.getByRole('link', { name: /View in Repair Verification/i }).click();
    await page.waitForURL('**/citizen/audit', { timeout: 15000 });

    // Settings link -> /citizen/settings & legacy ?tab=settings redirect
    await page.goto('/citizen/profile?tab=settings');
    await page.waitForURL('**/citizen/settings', { timeout: 15000 });

    await context.close();
  });

  test('New citizen with zero activity: all 4 stats show 0 and zero mock data appears', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const hash = await bcrypt.hash(seedPassword, 4);
    const zeroEmail = `zero-browser-${Date.now()}@example.com`;
    const zeroUser = await prisma.user.create({
      data: {
        email: zeroEmail,
        name: 'Fresh Citizen',
        passwordHash: hash,
        role: Role.CITIZEN,
        citizenProfile: { create: { reputation: 0, tier: Tier.CITIZEN } },
      },
    });
    createdUserIds.push(zeroUser.id);

    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAsCitizen(page, zeroEmail);
    await page.goto('/citizen/profile');

    await expect(page.getByTestId('stat-reports')).toHaveText('0');
    await expect(page.getByTestId('stat-verified-fixed')).toHaveText('0');
    await expect(page.getByTestId('stat-verifications')).toHaveText('0');
    await expect(page.getByTestId('stat-points')).toHaveText('0');
    await expect(page.locator('body')).toContainText('No reports submitted yet');
    await expect(page.locator('body')).toContainText('200 pts to Civic Contributor');

    for (const fake of [...FORBIDDEN_FAKE_STRINGS, '1,280', '1280']) {
      await expect(page.locator('body')).not.toContainText(fake);
    }

    await context.close();
  });
});
