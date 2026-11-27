import { test, expect } from '@playwright/test';
import { createSeedDb } from '../../scripts/lib/db-target';
import { seedDemoData } from '../../scripts/seed-demo';

const { prisma, verify: verifyTestDb } = createSeedDb();
const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

test.describe('500m GPS Accuracy & Distance Policy — Browser Regression (Test Schema)', () => {
  const createdIssueIds: string[] = [];

  test.beforeAll(async () => {
    await verifyTestDb();
    await seedDemoData();
  });

  test.afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.actionLog.deleteMany({ where: { issueId: { in: createdIssueIds } } }).catch(() => {});
      await prisma.report.deleteMany({ where: { issueId: { in: createdIssueIds } } }).catch(() => {});
      await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } }).catch(() => {});
    }
  });

  test('Citizen REPORT with 118m GPS accuracy shows warning, preserves real accuracy, and submits; 501m accuracy shows Retry Location and blocks', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    // 1. 118m accuracy -> warning shown, submission succeeds
    const ctx118 = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 12.9288, longitude: 77.6772, accuracy: 118 },
    });
    const page118 = await ctx118.newPage();

    await page118.goto('/login/citizen');
    await page118.locator('input[type="email"]').fill('citizen@example.com');
    await page118.locator('input[type="password"]').fill(seedPassword);
    await page118.locator('button[type="submit"]').click();
    await page118.waitForURL('**/citizen/dashboard', { timeout: 30000 });

    await page118.goto('/citizen/report');
    await page118.getByRole('button', { name: /Potholes/i }).first().click();
    await page118.getByRole('button', { name: /Next: Capture Evidence/i }).click();

    await expect(page118.locator('body')).toContainText('± 118.0 m', { timeout: 15000 });
    await expect(page118.locator('body')).toContainText(
      'Your location accuracy is approximately 118 metres. Please confirm the issue location carefully.'
    );

    await page118.locator('[data-testid="camera-file-upload"]').setInputFiles({
      name: 'report-118m.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });
    await expect(page118.locator('body')).toContainText('Nonce verified', { timeout: 15000 });
    await page118.getByRole('button', { name: /Next: Add Details/i }).click();
    await page118.locator('#report-notes-field').fill(`E2E 118m accuracy ${Date.now()}`);
    await page118.getByRole('button', { name: /Next: Review/i }).click();

    await expect(page118.locator('body')).toContainText('± 118.0 m');
    await page118.getByRole('button', { name: /Submit Report/i }).click();
    await page118.waitForURL('**/citizen/report/**', { timeout: 20000 });

    const issueId = page118.url().split('/citizen/report/')[1]?.split('?')[0];
    expect(issueId).toBeTruthy();
    if (issueId) {
      createdIssueIds.push(issueId);
      const report = await prisma.report.findFirst({ where: { issueId } });
      expect(report?.gpsAccuracyM).toBe(118);
    }
    await ctx118.close();

    // 2. 501m accuracy -> blocked with Retry Location button
    const ctx501 = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 12.9288, longitude: 77.6772, accuracy: 501 },
    });
    const page501 = await ctx501.newPage();

    await page501.goto('/login/citizen');
    await page501.locator('input[type="email"]').fill('citizen@example.com');
    await page501.locator('input[type="password"]').fill(seedPassword);
    await page501.locator('button[type="submit"]').click();
    await page501.waitForURL('**/citizen/dashboard', { timeout: 30000 });

    await page501.goto('/citizen/report');
    await page501.getByRole('button', { name: /Next: Capture Evidence/i }).click();

    await expect(page501.locator('body')).toContainText('exceeds the 500 m maximum', { timeout: 15000 });
    await expect(page501.getByRole('button', { name: /Retry Location/i })).toBeVisible();
    await ctx501.close();
  });
});
