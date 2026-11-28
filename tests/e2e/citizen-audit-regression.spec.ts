import { test, expect } from '@playwright/test';
import { createSeedDb } from '../../scripts/lib/db-target';
import { AuditKind, AuditTaskStatus, Band, Category, EvidenceRole, Role, Status } from '@prisma/client';
import { seedDemoData } from '../../scripts/seed-demo';

const { prisma, verify: verifyTestDb } = createSeedDb();
const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

test.describe('Page 6: Repair Verification — Authenticated Browser Regression (Test Schema)', () => {
  const createdIssueIds: string[] = [];

  test.beforeAll(async () => {
    await verifyTestDb();
    await seedDemoData();
  });

  test.afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.auditVote.deleteMany({
        where: { task: { issueId: { in: createdIssueIds } } },
      }).catch(() => {});
      await prisma.auditTask.deleteMany({
        where: { issueId: { in: createdIssueIds } },
      }).catch(() => {});
      await prisma.actionLog.deleteMany({
        where: { issueId: { in: createdIssueIds } },
      }).catch(() => {});
      await prisma.report.deleteMany({
        where: { issueId: { in: createdIssueIds } },
      }).catch(() => {});
      await prisma.issue.deleteMany({
        where: { id: { in: createdIssueIds } },
      }).catch(() => {});
    }
  });

  async function loginAsCitizen(page: import('@playwright/test').Page) {
    await page.goto('/login/citizen');
    await page.locator('input[type="email"]').fill('citizen@example.com');
    await page.locator('input[type="password"]').fill(seedPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/citizen/dashboard', { timeout: 30000 });
  }

  test('Nearby requires GPS, Explore by Ward works, Blind UI hides spoilers, 30m gate + Field Notes + /issue/[id] + multi-round', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    // Ensure citizen@example.com is eligible (> 48h old) and create a fresh CLAIMED_FIXED issue by another reporter
    const auditor = await prisma.user.findUnique({ where: { email: 'citizen@example.com' } });
    const otherReporter = await prisma.user.findFirst({
      where: { role: Role.CITIZEN, NOT: { email: 'citizen@example.com' } },
    });
    const deskUser = await prisma.user.findFirst({ where: { role: Role.AUTHORITY } });
    const ward = await prisma.ward.findFirst();
    expect(auditor).not.toBeNull();
    expect(otherReporter).not.toBeNull();
    expect(deskUser).not.toBeNull();
    expect(ward).not.toBeNull();

    const siteLat = 12.9285;
    const siteLng = 77.6768;
    const uniqueTag = `E2E-AUDIT-${Date.now()}`;
    const contractorSecret = `SecretContractor-${uniqueTag}`;
    const tenderSecret = `TENDER-${uniqueTag}`;

    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        address: `${uniqueTag} Bellandur Lake Road`,
        lat: siteLat,
        lng: siteLng,
        band: Band.HIGH,
        status: Status.CLAIMED_FIXED,
        wardId: ward!.id,
        contractorName: contractorSecret,
        tenderId: tenderSecret,
        repairClaimedAt: new Date(Date.now() - 60_000),
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    createdIssueIds.push(issue.id);

    await prisma.report.createMany({
      data: [
        {
          issueId: issue.id,
          userId: otherReporter!.id,
          role: EvidenceRole.REPORT,
          photoUrl: '/uploads/e2e-orig-spoiler.jpg',
          photoSha256: `orig-${uniqueTag}`,
          signature: 'sig-orig',
          nonce: `nonce-orig-${uniqueTag}`,
          lat: siteLat,
          lng: siteLng,
          gpsAccuracyM: 6,
          capturedAt: new Date(Date.now() - 3600_000),
          note: `OrigNote-${uniqueTag}`,
        },
        {
          issueId: issue.id,
          userId: deskUser!.id,
          role: EvidenceRole.CLAIM_FIX,
          photoUrl: '/uploads/e2e-repair-spoiler.jpg',
          photoSha256: `rep-${uniqueTag}`,
          signature: 'sig-rep',
          nonce: `nonce-rep-${uniqueTag}`,
          lat: siteLat,
          lng: siteLng,
          gpsAccuracyM: 6,
          capturedAt: new Date(Date.now() - 60_000),
          note: `RepairNote-${uniqueTag}`,
        },
      ],
    });

    const task = await prisma.auditTask.create({
      data: {
        issueId: issue.id,
        kind: AuditKind.CLAIM_CHECK,
        status: AuditTaskStatus.OPEN,
        dueAt: new Date(Date.now() + 24 * 3600 * 1000),
        challengeBearingDeg: 90,
        challengeNonce: `audit-nonce-${uniqueTag}`,
      },
    });

    // 1. Nearby without GPS -> locationRequired prompt (no city-wide leak)
    const noGpsCtx = await browser.newContext({ permissions: [] });
    const noGpsPage = await noGpsCtx.newPage();
    await loginAsCitizen(noGpsPage);
    await noGpsPage.goto('/citizen/audit');

    await expect(noGpsPage.locator('body')).toContainText('Location required for Nearby verification', {
      timeout: 15000,
    });
    await expect(noGpsPage.getByRole('button', { name: 'Retry Location' })).toBeVisible();
    await expect(noGpsPage.getByRole('button', { name: 'Explore by Ward' }).last()).toBeVisible();
    await expect(noGpsPage.locator('body')).not.toContainText(uniqueTag);

    // Switch to Explore by Ward -> tasks load
    await noGpsPage.getByRole('button', { name: 'Explore by Ward' }).first().click();
    await expect(noGpsPage.locator('body')).toContainText('Active Ward:', { timeout: 10000 });
    await noGpsCtx.close();

    // 2. Farther than 500m (~610m away) -> 500m proximity gate blocks submit
    const farCtx = await browser.newContext({
      permissions: ['geolocation', 'camera'],
      geolocation: { latitude: siteLat + 0.0055, longitude: siteLng, accuracy: 5 },
    });
    const farPage = await farCtx.newPage();
    await loginAsCitizen(farPage);
    await farPage.goto('/citizen/audit');

    // Verify all 5 radius options exist
    for (const label of ['Within 500 m', 'Within 1 km', 'Within 2 km', 'Within 5 km', 'Within 10 km']) {
      await expect(farPage.getByRole('button', { name: label, exact: true })).toBeVisible({ timeout: 15000 });
    }

    // Verify blind pre-vote card hides spoilers
    await expect(farPage.locator('body')).toContainText(`${uniqueTag} Bellandur Lake Road`, { timeout: 15000 });
    await expect(farPage.locator('body')).toContainText('Independent Site Inspection');
    await expect(farPage.locator('body')).not.toContainText('Claimed fixed');
    await expect(farPage.locator('body')).not.toContainText('View Details');
    await expect(farPage.locator('body')).not.toContainText(contractorSecret);
    await expect(farPage.locator('body')).not.toContainText(tenderSecret);

    await farPage
      .locator('div.bg-white.rounded-2xl', { hasText: `${uniqueTag} Bellandur Lake Road` })
      .getByRole('button', { name: /Visit and Verify/i })
      .first()
      .click();

    // Verify blind inspection briefing hides spoilers
    await expect(farPage.locator('body')).toContainText('Independent Site Inspection');
    await expect(farPage.locator('body')).not.toContainText('Original Defect Photograph');
    await expect(farPage.locator('body')).not.toContainText('Agency Repair Claim Photograph');
    await expect(farPage.locator('body')).not.toContainText(contractorSecret);
    await expect(farPage.locator('body')).not.toContainText(tenderSecret);
    await expect(farPage.locator('body')).not.toContainText(`OrigNote-${uniqueTag}`);
    await expect(farPage.locator('body')).not.toContainText(`RepairNote-${uniqueTag}`);

    await farPage.getByRole('button', { name: /Verify Repair at Location/i }).click();
    await farPage.locator('[data-testid="camera-file-upload"]').setInputFiles({
      name: 'audit-far.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });

    await expect(farPage.locator('body')).toContainText('must be within 500 m', { timeout: 15000 });
    await expect(farPage.locator('body')).toContainText('Compass heading unavailable');
    await farPage.getByRole('button', { name: /Repair completed correctly/i }).click();
    await expect(farPage.getByRole('button', { name: /Review & Confirm Verification/i })).toBeDisabled();
    await farCtx.close();

    // 3. Within 30m -> submit with Field Notes, verify DB persistence, My Submissions /issue/[id], & multi-round
    const nearCtx = await browser.newContext({
      permissions: ['geolocation', 'camera'],
      geolocation: { latitude: siteLat, longitude: siteLng, accuracy: 5 },
    });
    const nearPage = await nearCtx.newPage();
    nearPage.on('pageerror', (err) => console.error('NEARPAGE ERROR:', err));
    nearPage.on('console', (msg) => {
      if (msg.type() === 'error') console.error('NEARPAGE CONSOLE ERROR:', msg.text());
    });
    await loginAsCitizen(nearPage);
    await nearPage.goto('/citizen/audit');

    await nearPage
      .locator('div.bg-white.rounded-2xl', { hasText: `${uniqueTag} Bellandur Lake Road` })
      .getByRole('button', { name: /Visit and Verify/i })
      .first()
      .click();

    await nearPage.getByRole('button', { name: /Verify Repair at Location/i }).click();
    await nearPage.locator('[data-testid="camera-file-upload"]').setInputFiles({
      name: 'audit-near.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });

    await expect(nearPage.locator('body')).toContainText('Within 500 m audit radius', { timeout: 15000 });
    await nearPage.getByRole('button', { name: /Repair completed correctly/i }).click();
    const fieldNote = `Field note ${uniqueTag}: smooth asphalt`;
    await nearPage.locator('textarea').fill(fieldNote);
    await nearPage.getByRole('button', { name: /Review & Confirm Verification/i }).click();
    await nearPage.getByRole('button', { name: /Submit Verification/i }).click();

    await expect(nearPage.locator('body')).toContainText('Verification successfully submitted', {
      timeout: 15000,
    });

    // Verify Field Notes persisted on EvidenceRole.AUDIT Report in DB
    const auditReport = await prisma.report.findFirst({
      where: { issueId: issue.id, userId: auditor!.id, role: EvidenceRole.AUDIT },
    });
    expect(auditReport).not.toBeNull();
    expect(auditReport?.note).toContain(fieldNote);

    // Wait for post-submit refresh & auto-switch to My Submissions, then verify /issue/[issueId] link
    await nearPage.waitForTimeout(1800);
    await nearPage.getByRole('button', { name: /My Submissions/i }).click({ timeout: 5000 });
    const subLink = nearPage.locator(`a[href="/issue/${issue.id}"]`);
    await expect(subLink).toBeVisible({ timeout: 10000 });

    // Multi-round re-verification: advance repairClaimedAt & create a new OPEN task -> same citizen sees it again
    await prisma.auditTask.update({
      where: { id: task.id },
      data: { status: AuditTaskStatus.DONE },
    });
    await prisma.issue.update({
      where: { id: issue.id },
      data: { repairClaimedAt: new Date(Date.now() + 1000) },
    });
    await prisma.auditTask.create({
      data: {
        issueId: issue.id,
        kind: AuditKind.CLAIM_CHECK,
        status: AuditTaskStatus.OPEN,
        dueAt: new Date(Date.now() + 24 * 3600 * 1000),
        challengeBearingDeg: 90,
        challengeNonce: `audit-nonce-r2-${uniqueTag}`,
      },
    });

    const round2Res = await nearPage.request.get(
      `/api/audit/nearby?mode=NEARBY&lat=${siteLat}&lng=${siteLng}&radiusM=2000`
    );
    expect(round2Res.status()).toBe(200);
    const round2Json = await round2Res.json();
    const round2Task = round2Json.tasks.find((t: { issueId: string }) => t.issueId === issue.id);
    expect(round2Task).toBeDefined();

    await nearCtx.close();
  });
});
