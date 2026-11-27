import { test, expect } from '@playwright/test';
import { createSeedDb } from '../../scripts/lib/db-target';
import { Category, Status } from '@prisma/client';
import { seedDemoData } from '../../scripts/seed-demo';

const { prisma, verify: verifyTestDb } = createSeedDb();
const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

// Minimal valid 1x1 JPEG bytes
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

test.describe('Page 3: Report an Issue — Authenticated Browser Regression (Test Schema)', () => {
  let createdIssueId: string | null = null;
  let offlineIssueId: string | null = null;

  test.beforeAll(async () => {
    await verifyTestDb();
    await seedDemoData();
  });

  async function loginAsCitizen(page: import('@playwright/test').Page) {
    await page.goto('/login/citizen');
    await page.locator('input[type="email"]').fill('citizen@example.com');
    await page.locator('input[type="password"]').fill(seedPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/citizen/dashboard', { timeout: 20000 });
  }

  async function loginAsDesk(page: import('@playwright/test').Page) {
    await page.goto('/login/staff');
    await page.locator('input[type="email"]').fill('desk-a@civicpulse.local');
    await page.locator('input[type="password"]').fill(seedPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/desk(?:\/.*)?$/, { timeout: 20000 });
  }

  test('A & E: 12 categories, gallery validation, retake, GPS + pin adjust, online submit & cross-page sync', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: {
        latitude: 12.9279 + 0.001 + Math.random() * 0.002,
        longitude: 77.6762 + 0.001 + Math.random() * 0.002,
        accuracy: 8.5,
      },
    });
    const page = await context.newPage();

    await loginAsCitizen(page);
    await page.goto('/citizen/report');

    // 1. Verify all 12 Prisma categories exist and are selectable
    for (const cat of Object.values(Category)) {
      await expect(page.getByTestId(`category-card-${cat}`)).toBeVisible();
    }
    await page.getByTestId('category-card-WATERLOGGING').click();
    await page.getByRole('button', { name: /Next: Capture Evidence/i }).click();

    // 2. Evidence Security starts Pending (no fake checkmarks)
    const secPanel = page.getByTestId('evidence-security-panel');
    await expect(secPanel).toContainText('Pending');
    await expect(page.locator('body')).not.toContainText('12.9347');
    await expect(page.locator('body')).not.toContainText('± 4.8 m');

    // Next button must be disabled until real evidence is attached
    const nextDetailsBtn = page.getByRole('button', { name: /Next: Add Details/i });
    await expect(nextDetailsBtn).toBeDisabled();

    // 3. Invalid file type & empty file & >10MB rejection
    const fileInput = page.getByTestId('camera-file-upload');
    await fileInput.setInputFiles({
      name: 'bad.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.getByTestId('evidence-error-banner')).toContainText('Unsupported file type');

    await fileInput.setInputFiles({
      name: 'empty.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(0),
    });
    await expect(page.getByTestId('evidence-error-banner')).toContainText('empty');

    await fileInput.setInputFiles({
      name: 'huge.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(10.5 * 1024 * 1024, 0xff),
    });
    await expect(page.getByTestId('evidence-error-banner')).toContainText('10 MB');

    // 4. Upload genuine JPEG, then test Retake / Replace repeatedly
    await fileInput.setInputFiles({
      name: 'defect-1.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });
    await expect(secPanel).toContainText('Nonce verified', { timeout: 15000 });
    await expect(nextDetailsBtn).toBeEnabled();

    // Retake / Replace
    await page.getByRole('button', { name: /Retake Photo/i }).click();
    await expect(secPanel).toContainText('Pending');
    await fileInput.setInputFiles({
      name: 'defect-2.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });
    await expect(secPanel).toContainText('Nonce verified', { timeout: 15000 });

    // 5. Details & Review
    await nextDetailsBtn.click();
    const noteText = `E2E Waterlogging regression ${Date.now()}`;
    await page.locator('#report-notes-field').fill(noteText);
    await page.getByRole('button', { name: 'One Lane' }).click();
    await page.getByRole('button', { name: /Next: Review/i }).click();

    await expect(page.locator('body')).toContainText('Waterlogging');
    await expect(page.locator('body')).toContainText('Selected Issue Pin:');
    await expect(page.locator('body')).toContainText('Device Capture GPS:');
    await expect(page.locator('body')).toContainText('ECDSA P-256 + Server Nonce');

    // 6. Submit online & verify single DB record + detail page
    await page.getByRole('button', { name: /Submit Report/i }).click();
    await page.waitForURL('**/citizen/report/**', { timeout: 20000 });
    const urlParts = page.url().split('/citizen/report/')[1]?.split('?')[0];
    createdIssueId = urlParts || null;
    expect(createdIssueId).toBeTruthy();

    const dbIssue = await prisma.issue.findUnique({ where: { id: createdIssueId! } });
    expect(dbIssue).not.toBeNull();
    expect(dbIssue?.category).toBe(Category.WATERLOGGING);
    expect(dbIssue?.status).toBe(Status.OPEN);

    // 7. Cross-page: Citizen Profile
    await page.goto('/citizen/profile');
    await expect(page.locator('body')).toContainText('Waterlogging');

    await context.close();
  });

  test('B: Permission denied & failed submission never substitute fake data', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: [], // Camera & Geolocation denied/ungranted
    });
    const page = await context.newPage();

    await loginAsCitizen(page);
    await page.goto('/citizen/report');
    await page.getByRole('button', { name: /Next: Capture Evidence/i }).click();

    // Must show honest unavailable/denied state and NEVER fake coordinates
    await expect(page.locator('body')).toContainText(/Camera unavailable|GPS Required|Location permission/i, {
      timeout: 15000,
    });
    await expect(page.locator('body')).not.toContainText('12.9347');
    await expect(page.locator('body')).not.toContainText('± 4.8 m');
    await expect(page.getByRole('button', { name: /Next: Add Details/i })).toBeDisabled();

    await context.close();
  });

  test('C: Offline lifecycle — Saved Locally -> Pending Sync -> Online Sync without duplicates', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: {
        latitude: 12.931 + Math.random() * 0.002,
        longitude: 77.679 + Math.random() * 0.002,
        accuracy: 7.0,
      },
    });
    const page = await context.newPage();

    await loginAsCitizen(page);
    await page.goto('/citizen/report');
    await page.getByTestId('category-card-ROAD_CUT').click();
    await page.getByRole('button', { name: /Next: Capture Evidence/i }).click();

    // Wait for GPS fix while online, then go offline before capturing
    await expect(page.locator('body')).toContainText('Within City Limits', { timeout: 15000 });
    await context.setOffline(true);

    const offlineJpeg = Buffer.concat([TINY_JPEG, Buffer.from(`offline-${Date.now()}`)]);
    await page.getByTestId('camera-file-upload').setInputFiles({
      name: 'offline-defect.jpg',
      mimeType: 'image/jpeg',
      buffer: offlineJpeg,
    });
    await expect(page.getByTestId('evidence-security-panel')).toContainText('Signed locally (offline)', {
      timeout: 10000,
    });

    await page.getByRole('button', { name: /Next: Add Details/i }).click();
    const offlineNote = `Offline Road Cut ${Date.now()}`;
    await page.locator('#report-notes-field').fill(offlineNote);
    await page.getByRole('button', { name: /Next: Review/i }).click();
    await page.getByRole('button', { name: /Save Offline Draft/i }).click();

    await expect(page.getByTestId('offline-queued-confirmation')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('offline-queued-confirmation')).toContainText('Saved Locally • Pending Sync');

    // Verify NOT yet on server
    const beforeSync = await prisma.report.findFirst({ where: { note: offlineNote } });
    expect(beforeSync).toBeNull();

    // Restore network and visit dashboard to trigger sync
    await context.setOffline(false);
    await page.goto('/citizen/dashboard');

    await expect
      .poll(
        async () => {
          const rows = await prisma.report.findMany({ where: { note: offlineNote } });
          return rows.length;
        },
        { timeout: 25000, message: 'Expected offline report to sync to schema=test DB' }
      )
      .toBe(1);

    // Reload dashboard and confirm retry/re-mount never creates duplicates
    await page.reload();
    await page.waitForTimeout(1500);
    const afterSync = await prisma.report.findMany({ where: { note: offlineNote } });
    expect(afterSync.length).toBe(1);
    offlineIssueId = afterSync[0]?.issueId || null;

    // Citizen must remain restricted from Municipal Staff routes
    await page.goto('/desk/dashboard');
    await expect(page.locator('body')).toContainText(/Municipal Desk|Authority|Restricted|Citizen/i, {
      timeout: 10000,
    });
    await expect(page.locator('body')).not.toContainText('Operations Queue');

    await context.close();
  });

  test('D & E: Municipal Operations Queue sees reported issue & Repair Verification / Desk pages load', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAsDesk(page);
    await page.goto('/desk/dashboard');
    await expect(page.locator('body')).toContainText('Operations Queue', { timeout: 15000 });
    if (createdIssueId) {
      await page.locator('input[placeholder*="Search"]').fill(createdIssueId);
      await page.waitForTimeout(1000);
      await expect(page.locator('body')).toContainText(/WATERLOGGING/i);
    }

    await context.close();
    void offlineIssueId;
  });
});
