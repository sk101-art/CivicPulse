import { test, expect } from '@playwright/test';
import { PrismaClient, Status, Category, Band } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { computePhotoHash, signEvidencePayload, type EvidencePayload } from '../../src/lib/evidence/sign';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const connectionString = process.env.APP_DATABASE_URL || process.env.DIRECT_DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

test.describe('Phase 2 E2E Acceptance Suite (T20–T29)', () => {
  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];

  test.afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.verification.deleteMany({
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

    if (createdUserIds.length > 0) {
      await prisma.deviceKey.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => {});
    }

    await pool.end().catch(() => {});
  });

  // T20 Acceptance: Device signing keys
  test('T20 e2e: after login, a DeviceKey row exists; reloading the page reuses the same key', async ({ page }) => {
    // 1. Log in as citizen
    await page.goto('/login');
    await page.fill('input[type="email"]', 'citizen@example.com');
    await page.fill('input[type="password"]', seedPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => url.pathname.includes('/citizen/dashboard'), { timeout: 15000 });

    // Wait a moment for DeviceKeyInitializer to register key in background
    await page.waitForTimeout(1500);

    const citizen = await prisma.user.findFirstOrThrow({
      where: { email: 'citizen@example.com' },
    });

    const keysBefore = await prisma.deviceKey.findMany({
      where: { userId: citizen.id },
      orderBy: { createdAt: 'desc' },
    });

    expect(keysBefore.length).toBeGreaterThanOrEqual(1);
    const initialKeyCount = keysBefore.length;
    const initialKeyId = keysBefore[0].id;

    // 2. Reload the page
    await page.reload();
    await page.waitForTimeout(1500);

    const keysAfter = await prisma.deviceKey.findMany({
      where: { userId: citizen.id },
      orderBy: { createdAt: 'desc' },
    });

    // Same key is reused, count has not increased
    expect(keysAfter.length).toBe(initialKeyCount);
    expect(keysAfter[0].id).toBe(initialKeyId);
  });

  // T22 Acceptance: Camera capture has no file input on camera component
  test('T22 e2e: capture page has no file input on camera component', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'citizen@example.com');
    await page.fill('input[type="password"]', seedPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes('/citizen/dashboard'), { timeout: 15000 });

    await page.goto('/citizen/report');
    await page.waitForLoadState('domcontentloaded');

    // Click on POTHOLES category
    const potholeButton = page.locator('button:has-text("Potholes")');
    await potholeButton.first().click();

    // Now in CAPTURE step: verify Capture Signed Evidence header is visible
    const captureHeading = page.locator('text=Capture Signed Evidence');
    await expect(captureHeading).toBeVisible({ timeout: 10000 });

    // Verify video element is present
    const videoElement = page.locator('video');
    await expect(videoElement).toBeAttached();

    // Verify inside the camera video container there is NO file input
    const videoParent = videoElement.locator('..');
    const fileInputsInCamera = videoParent.locator('input[type="file"]');
    expect(await fileInputsInCamera.count()).toBe(0);
  });

  // T23 Acceptance: Report flow rewrite and deduplication
  test('T23 e2e: citizen files a report and lands on /issue/<id> with the photo visible; a second report 10 m away merges', async ({ page }) => {
    const citizen = await prisma.user.findFirstOrThrow({
      where: { email: 'citizen@example.com' },
    });

    // 1. Create first report via API with valid signed photo at a unique test coordinate
    const sampleImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const photoBuffer = Buffer.from(sampleImageBase64, 'base64');
    const photoHash = await computePhotoHash(photoBuffer);

    // Create a registered device key for signing
    const keyPair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const publicJwk = await globalThis.crypto.subtle.exportKey('jwk', keyPair.publicKey);

    await prisma.deviceKey.create({
      data: {
        userId: citizen.id,
        publicJwk: publicJwk as object,
      },
    });

    // Generate unique coordinates in pilot region away from any existing issues
    const offset = (Date.now() % 10000) / 100000;
    const lat1 = 12.94500 + offset;
    const lng1 = 77.68500 + offset;

    const payload1: EvidencePayload = {
      accuracy: 5,
      capturedAt: new Date().toISOString(),
      lat: lat1,
      lng: lng1,
      nonce: 'offline',
      photoHash,
      role: 'REPORT',
    };
    const signature1 = await signEvidencePayload(payload1, keyPair.privateKey);

    // Log in citizen in browser session
    await page.goto('/login');
    await page.fill('input[type="email"]', 'citizen@example.com');
    await page.fill('input[type="password"]', seedPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes('/citizen/dashboard'), { timeout: 15000 });

    // Submit report 1 via authenticated browser fetch
    const submitReport1 = await page.evaluate(async (data) => {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { status: res.status, json: await res.json() };
    }, {
      category: 'POTHOLES',
      photoBase64: sampleImageBase64,
      mimeType: 'image/jpeg',
      payload: payload1,
      signature: signature1,
      offline: true,
      note: 'E2E First Pothole Report',
    });

    expect(submitReport1.status).toBe(201);
    const issueId = submitReport1.json.issue.id;
    createdIssueIds.push(issueId);

    // Navigate to /issue/<id>
    await page.goto(`/issue/${issueId}`);
    await page.waitForLoadState('domcontentloaded');

    // Verify photo is visible
    const photoImg = page.locator('img[alt*="Report"], img[alt*="Initial Report"], img[alt*="Confirmation"]');
    await expect(photoImg.first()).toBeVisible();

    // 2. Submit second report 10m away
    const lat2 = lat1 + 0.00008; // ~9 meters away
    const lng2 = lng1 + 0.00008;
    const payload2: EvidencePayload = {
      accuracy: 5,
      capturedAt: new Date().toISOString(),
      lat: lat2,
      lng: lng2,
      nonce: 'offline',
      photoHash,
      role: 'REPORT',
    };
    const signature2 = await signEvidencePayload(payload2, keyPair.privateKey);

    const submitReport2 = await page.evaluate(async (data) => {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { status: res.status, json: await res.json() };
    }, {
      category: 'POTHOLES',
      photoBase64: sampleImageBase64,
      mimeType: 'image/jpeg',
      payload: payload2,
      signature: signature2,
      offline: true,
      note: 'E2E Second Pothole Report 10m away',
    });

    expect(submitReport2.status).toBe(201);
    expect(submitReport2.json.isDuplicate).toBe(true);
    expect(submitReport2.json.issue.id).toBe(issueId);

    // Verify report count in DB is 2
    const updatedIssue = await prisma.issue.findUnique({
      where: { id: issueId },
      include: { reports: true },
    });
    expect(updatedIssue?.reports.length).toBe(2);
  });

  // T26 Acceptance: Shared desk dashboard
  test('T26 e2e: desk-a confirms an issue, desk-b sees "Confirmed by Desk A"', async ({ browser }) => {
    // 1. Create an OPEN test issue
    const bwssb = await prisma.agency.findFirstOrThrow({ where: { code: 'BWSSB' } });
    const issue = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        status: Status.OPEN,
        priority: 75.0,
        band: Band.HIGH,
        lat: 12.9350,
        lng: 77.6940,
        address: 'Marathahalli ORR Junction',
        agencyId: bwssb.id,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    createdIssueIds.push(issue.id);

    // 2. Desk A context: log in and confirm issue
    const deskAContext = await browser.newContext();
    const pageA = await deskAContext.newPage();
    await pageA.goto('/login');
    await pageA.fill('input[type="email"]', 'desk-a@civicpulse.local');
    await pageA.fill('input[type="password"]', seedPassword);
    await pageA.click('button[type="submit"]');
    await pageA.waitForURL((url) => url.pathname.includes('/desk'), { timeout: 15000 });

    // Confirm issue via desk actions API from Desk A session
    const confirmRes = await pageA.evaluate(async (issueId) => {
      const res = await fetch(`/api/issues/${issueId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CONFIRM', note: 'Verified by Desk A on duty' }),
      });
      return { status: res.status, json: await res.json() };
    }, issue.id);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.json.issue.status).toBe('CONFIRMED');

    // 3. Desk B context: log in and check that Desk B sees "Desk A" / "CONFIRM"
    const deskBContext = await browser.newContext();
    const pageB = await deskBContext.newPage();
    await pageB.goto('/login');
    await pageB.fill('input[type="email"]', 'desk-b@civicpulse.local');
    await pageB.fill('input[type="password"]', seedPassword);
    await pageB.click('button[type="submit"]');
    await pageB.waitForURL((url) => url.pathname.includes('/desk'), { timeout: 15000 });

    // Desk B queries the issue log
    const logRes = await pageB.evaluate(async (issueId) => {
      const res = await fetch(`/api/issues/${issueId}/log`);
      return { status: res.status, json: await res.json() };
    }, issue.id);

    expect(logRes.status).toBe(200);
    const confirmLog = logRes.json.logs.find((l: { action: string }) => l.action === 'CONFIRM');
    expect(confirmLog).toBeDefined();
    expect(confirmLog.actorName).toBe('Desk A');

    await deskAContext.close();
    await deskBContext.close();
  });

  // T27 Acceptance: Claim fix and citizen disputes -> DISPUTED
  test('T27 e2e: desk claims, citizen disputes → DISPUTED', async ({ browser }) => {
    // 1. Create an ASSIGNED issue
    const bwssb = await prisma.agency.findFirstOrThrow({ where: { code: 'BWSSB' } });
    const deskUser = await prisma.user.findFirstOrThrow({ where: { email: 'desk-a@civicpulse.local' } });
    const citizen = await prisma.user.findFirstOrThrow({ where: { email: 'citizen@example.com' } });

    // Ensure citizen account age >= 24h
    await prisma.user.update({
      where: { id: citizen.id },
      data: { createdAt: new Date(Date.now() - 48 * 3600 * 1000) },
    });

    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.ASSIGNED,
        priority: 70.0,
        band: Band.HIGH,
        lat: 12.9360,
        lng: 77.6950,
        address: 'Kadubeesanahalli Main Rd',
        agencyId: bwssb.id,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    createdIssueIds.push(issue.id);

    // Setup signing keys for Desk
    const deskKeyPair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const deskPublicJwk = await globalThis.crypto.subtle.exportKey('jwk', deskKeyPair.publicKey);
    await prisma.deviceKey.create({
      data: { userId: deskUser.id, publicJwk: deskPublicJwk as object },
    });

    // Setup signing keys for Citizen
    const citizenKeyPair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const citizenPublicJwk = await globalThis.crypto.subtle.exportKey('jwk', citizenKeyPair.publicKey);
    await prisma.deviceKey.create({
      data: { userId: citizen.id, publicJwk: citizenPublicJwk as object },
    });

    const sampleImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const photoHash = await computePhotoHash(Buffer.from(sampleImageBase64, 'base64'));

    // 2. Desk claims fix via /api/issues/[id]/actions
    const deskContext = await browser.newContext();
    const deskPage = await deskContext.newPage();
    await deskPage.goto('/login');
    await deskPage.fill('input[type="email"]', 'desk-a@civicpulse.local');
    await deskPage.fill('input[type="password"]', seedPassword);
    await deskPage.click('button[type="submit"]');
    await deskPage.waitForURL((url) => url.pathname.includes('/desk'), { timeout: 15000 });

    // Desk gets a live nonce for CLAIM_FIX
    const deskNonceRes = await deskPage.evaluate(async () => {
      const res = await fetch('/api/evidence/nonce', { method: 'POST' });
      return res.json();
    });

    const deskPayload: EvidencePayload = {
      accuracy: 5,
      capturedAt: new Date().toISOString(),
      lat: issue.lat,
      lng: issue.lng,
      nonce: deskNonceRes.nonce,
      photoHash,
      role: 'CLAIM_FIX',
    };
    const deskSignature = await signEvidencePayload(deskPayload, deskKeyPair.privateKey);

    const claimRes = await deskPage.evaluate(async ({ issueId, payload, signature, photoBase64 }) => {
      const res = await fetch(`/api/issues/${issueId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CLAIM_FIX',
          note: 'Asphalt patched completely',
          evidence: {
            payload,
            signature,
            photoBase64,
            mimeType: 'image/jpeg',
          },
        }),
      });
      return { status: res.status, json: await res.json() };
    }, { issueId: issue.id, payload: deskPayload, signature: deskSignature, photoBase64: sampleImageBase64 });

    expect(claimRes.status).toBe(200);
    expect(claimRes.json.issue.status).toBe('CLAIMED_FIXED');

    // 3. Citizen context: citizen disputes the fix
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    await citizenPage.goto('/login');
    await citizenPage.fill('input[type="email"]', citizen.email);
    await citizenPage.fill('input[type="password"]', seedPassword);
    await citizenPage.click('button[type="submit"]');
    await citizenPage.waitForURL((url) => url.pathname.includes('/citizen/dashboard'), { timeout: 15000 });

    // Fetch nonce for citizen verification
    const nonceRes = await citizenPage.evaluate(async () => {
      const res = await fetch('/api/evidence/nonce', { method: 'POST' });
      return res.json();
    });

    const citizenPayload: EvidencePayload = {
      accuracy: 5,
      capturedAt: new Date().toISOString(),
      lat: issue.lat,
      lng: issue.lng,
      nonce: nonceRes.nonce,
      photoHash,
      role: 'VERIFY',
    };
    const citizenSignature = await signEvidencePayload(citizenPayload, citizenKeyPair.privateKey);

    const disputeRes = await citizenPage.evaluate(async ({ issueId, payload, signature, photoBase64 }) => {
      const res = await fetch(`/api/issues/${issueId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verdict: 'NOT_FIXED',
          note: 'Patch washed away, defect still wide open',
          evidence: {
            payload,
            signature,
            photoBase64,
            mimeType: 'image/jpeg',
          },
        }),
      });
      return { status: res.status, json: await res.json() };
    }, { issueId: issue.id, payload: citizenPayload, signature: citizenSignature, photoBase64: sampleImageBase64 });

    expect(disputeRes.status).toBe(200);
    expect(disputeRes.json.issue.status).toBe('DISPUTED');

    const updated = await prisma.issue.findUnique({
      where: { id: issue.id },
    });
    expect(updated?.status).toBe(Status.DISPUTED);

    await deskContext.close();
    await citizenContext.close();
  });

  // T28 Acceptance: Public issue page renders for logged-out visitor without desk controls
  test('T28 e2e: logged-out visitor sees the timeline and photos; no desk-only controls rendered', async ({ page }) => {
    // Create an issue with photo report and action log
    const bwssb = await prisma.agency.findFirstOrThrow({ where: { code: 'BWSSB' } });
    const deskUser = await prisma.user.findFirstOrThrow({ where: { email: 'desk-a@civicpulse.local' } });

    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.CONFIRMED,
        priority: 65.0,
        band: Band.HIGH,
        lat: 12.9370,
        lng: 77.6960,
        agencyId: bwssb.id,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        reports: {
          create: {
            userId: deskUser.id,
            photoUrl: 'https://placehold.co/600x400/png?text=Public+Evidence',
            photoSha256: 'abc123sha256',
            signature: 'sig123',
            gpsAccuracyM: 8.5,
            lat: 12.9370,
            lng: 77.6960,
            capturedAt: new Date(),
            role: 'REPORT',
          },
        },
        actions: {
          create: [
            {
              actorId: deskUser.id,
              action: 'CONFIRM',
              fromStatus: Status.OPEN,
              toStatus: Status.CONFIRMED,
              note: 'Confirmed on site inspection',
            },
          ],
        },
      },
    });
    createdIssueIds.push(issue.id);

    // Clear cookies to guarantee logged-out visitor
    await page.context().clearCookies();

    // Navigate to public issue page
    await page.goto(`/issue/${issue.id}`);
    await page.waitForLoadState('domcontentloaded');

    // 1. Verify timeline and audit trail are visible
    const timelineHeading = page.locator('h2:has-text("Public Action Log & Audit Trail")');
    await expect(timelineHeading).toBeVisible();

    // 2. Verify evidence gallery and photo are visible
    const galleryHeading = page.locator('h2:has-text("Signed Evidence Gallery")');
    await expect(galleryHeading).toBeVisible();

    const photo = page.locator('img[alt*="Initial Report"]');
    await expect(photo).toBeVisible();

    // 3. Verify no desk-only controls are rendered
    const confirmButton = page.locator('button:has-text("Confirm Issue")');
    const assignButton = page.locator('button:has-text("Assign Agency")');
    const claimButton = page.locator('button:has-text("Claim Fix")');
    const overrideButton = page.locator('button:has-text("Override Band")');

    expect(await confirmButton.count()).toBe(0);
    expect(await assignButton.count()).toBe(0);
    expect(await claimButton.count()).toBe(0);
    expect(await overrideButton.count()).toBe(0);
  });

  // T29 Acceptance: Claim-gap page renders with seed data badge
  test('T29 e2e: claim-gap page renders with seed data labelled "seed"', async ({ page }) => {
    // Ensure at least one seed claim exists
    const seedIssue = await prisma.issue.findFirst({
      where: { isSeed: true },
    });

    if (seedIssue) {
      const deskUser = await prisma.user.findFirstOrThrow({ where: { email: 'desk-a@civicpulse.local' } });
      const existingClaim = await prisma.actionLog.findFirst({
        where: { issueId: seedIssue.id, action: 'CLAIM_FIX' },
      });
      if (!existingClaim) {
        await prisma.actionLog.create({
          data: {
            issueId: seedIssue.id,
            actorId: deskUser.id,
            action: 'CLAIM_FIX',
            fromStatus: Status.ASSIGNED,
            toStatus: Status.CLAIMED_FIXED,
            note: 'Seed claim fix for scorecard',
          },
        }).catch(() => {});
      }
    }

    await page.goto('/claim-gap');
    await page.waitForLoadState('domcontentloaded');

    // Verify title and scorecard
    const title = page.locator('h1:has-text("Claim Gap & Accountability Scorecard")');
    await expect(title).toBeVisible();

    // Verify seed disclaimer badge
    const seedBadge = page.locator('span:text-is("seed")');
    await expect(seedBadge).toBeVisible();

    // Verify scorecard table
    const table = page.locator('table');
    await expect(table.first()).toBeVisible();
  });
});
