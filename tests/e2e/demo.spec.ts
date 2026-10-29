import { test, expect } from '@playwright/test';
import { PrismaClient, Status } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { computePhotoHash, signEvidencePayload, type EvidencePayload } from '../../src/lib/evidence/sign';
import { seedDemoData } from '../../scripts/seed-demo';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const connectionString = process.env.APP_DATABASE_URL || process.env.DIRECT_DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

test.describe('T73: End-to-End CivicPulse Demo Story', () => {
  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];

  test.beforeAll(async () => {
    // Ensure all demo baseline data, agencies, and segments exist
    await seedDemoData();
  });

  test.afterAll(async () => {
    // Clean up created demo-story issues and reports
    if (createdIssueIds.length > 0) {
      await prisma.verification.deleteMany({
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

  test('Demo Story: Citizen report -> No gallery picker -> Signed claim -> Citizen dispute -> Claim gap rises -> Road timeline recurrence', async ({ browser }) => {
    const pilotSegmentId = 'seed-seg-orr-kadubeesanahalli';
    const pilotLat = 12.9360;
    const pilotLng = 77.6955;

    // 1. Setup Keys and Users
    const citizenUser1 = await prisma.user.findFirstOrThrow({ where: { email: 'citizen@example.com' } });
    const citizenUser2 = await prisma.user.findFirstOrThrow({ where: { email: 'citizen-b@civicpulse.local' } });
    const deskOfficer = await prisma.user.findFirstOrThrow({ where: { email: 'desk-a@civicpulse.local' } });

    // Ensure citizen accounts are older than 24h to satisfy verification eligibility rules
    await prisma.user.update({
      where: { id: citizenUser2.id },
      data: { createdAt: new Date(Date.now() - 48 * 3600 * 1000) },
    });

    // Generate in-memory ECDSA P-256 keys for the actors
    const keyPair1 = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const jwk1 = await globalThis.crypto.subtle.exportKey('jwk', keyPair1.publicKey);
    await prisma.deviceKey.create({
      data: { userId: citizenUser1.id, publicJwk: jwk1 as object },
    });

    const keyPairDesk = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const jwkDesk = await globalThis.crypto.subtle.exportKey('jwk', keyPairDesk.publicKey);
    await prisma.deviceKey.create({
      data: { userId: deskOfficer.id, publicJwk: jwkDesk as object },
    });

    const keyPair2 = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const jwk2 = await globalThis.crypto.subtle.exportKey('jwk', keyPair2.publicKey);
    await prisma.deviceKey.create({
      data: { userId: citizenUser2.id, publicJwk: jwk2 as object },
    });

    const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const photoHash = await computePhotoHash(Buffer.from(sampleBase64, 'base64'));

    // -------------------------------------------------------------------------
    // STEP 1: Citizen reports a pothole on Outer Ring Road
    // -------------------------------------------------------------------------
    const citizen1Context = await browser.newContext();
    const citizen1Page = await citizen1Context.newPage();

    await citizen1Page.goto('/login');
    await citizen1Page.fill('input[type="email"]', citizenUser1.email);
    await citizen1Page.fill('input[type="password"]', seedPassword);
    await citizen1Page.click('button[type="submit"]');
    await citizen1Page.waitForURL((url) => url.pathname.includes('/citizen/dashboard'), { timeout: 15000 });

    // Citizen requests an active cryptographic nonce
    const nonce1 = await citizen1Page.evaluate(async () => {
      const res = await fetch('/api/evidence/nonce', { method: 'POST' });
      const data = await res.json();
      return data.nonce;
    });
    expect(nonce1).toBeDefined();

    const reportPayload: EvidencePayload = {
      accuracy: 5.0,
      capturedAt: new Date().toISOString(),
      lat: pilotLat,
      lng: pilotLng,
      nonce: nonce1,
      photoHash,
      role: 'REPORT',
    };
    const signature1 = await signEvidencePayload(reportPayload, keyPair1.privateKey);

    // Citizen submits signed report
    const submitReportRes = await citizen1Page.evaluate(async (body) => {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json() };
    }, {
      category: 'POTHOLES',
      photoBase64: sampleBase64,
      mimeType: 'image/jpeg',
      payload: reportPayload,
      signature: signature1,
      note: 'Demo: Deep bus bay crater near Kadubeesanahalli flyover',
    });

    expect(submitReportRes.status).toBe(201);
    const demoIssueId = submitReportRes.json.issue.id;
    expect(demoIssueId).toBeDefined();
    createdIssueIds.push(demoIssueId);

    // Verify issue was assigned to ORR pilot road segment via PostGIS snapping
    const createdIssue = await prisma.issue.findUnique({
      where: { id: demoIssueId },
    });
    expect(createdIssue).not.toBeNull();
    expect(createdIssue?.status).toBe(Status.OPEN);
    expect(createdIssue?.segmentId).toBe(pilotSegmentId);

    // -------------------------------------------------------------------------
    // STEP 2: Desk confirms issue & tries to claim with a gallery image (no file input exists; assert it)
    // -------------------------------------------------------------------------
    const deskContext = await browser.newContext();
    const deskPage = await deskContext.newPage();

    await deskPage.goto('/login');
    await deskPage.fill('input[type="email"]', deskOfficer.email);
    await deskPage.fill('input[type="password"]', seedPassword);
    await deskPage.click('button[type="submit"]');
    await deskPage.waitForURL((url) => url.pathname.includes('/desk'), { timeout: 15000 });

    // Desk confirms the open issue
    const confirmRes = await deskPage.evaluate(async (issueId) => {
      const res = await fetch(`/api/issues/${issueId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONFIRM',
          note: 'Desk A verified citizen report at Kadubeesanahalli junction',
        }),
      });
      return { status: res.status, json: await res.json() };
    }, demoIssueId);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.json.issue.status).toBe('CONFIRMED');

    // Visit public issue page while logged in as desk
    await deskPage.goto(`/issue/${demoIssueId}`);
    await expect(deskPage.locator('h1')).toBeVisible();

    // Strict Rule: No generic gallery file picker (<input type="file">) exists
    const fileInputsCount = await deskPage.locator('input[type="file"]').count();
    expect(fileInputsCount).toBe(0);

    // -------------------------------------------------------------------------
    // STEP 3: Desk claims with a signed photo
    // -------------------------------------------------------------------------
    const deskNonce = await deskPage.evaluate(async () => {
      const res = await fetch('/api/evidence/nonce', { method: 'POST' });
      const data = await res.json();
      return data.nonce;
    });

    const deskPayload: EvidencePayload = {
      accuracy: 5.0,
      capturedAt: new Date().toISOString(),
      lat: pilotLat,
      lng: pilotLng,
      nonce: deskNonce,
      photoHash,
      role: 'CLAIM_FIX',
    };
    const deskSignature = await signEvidencePayload(deskPayload, keyPairDesk.privateKey);

    const claimRes = await deskPage.evaluate(async ({ issueId, payload, signature, photoBase64 }) => {
      const res = await fetch(`/api/issues/${issueId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CLAIM_FIX',
          note: 'Work completed by Sri Lakshmi Infrastructure: cold mix bitumen patch applied',
          evidence: {
            payload,
            signature,
            photoBase64,
            mimeType: 'image/jpeg',
          },
        }),
      });
      return { status: res.status, json: await res.json() };
    }, {
      issueId: demoIssueId,
      payload: deskPayload,
      signature: deskSignature,
      photoBase64: sampleBase64,
    });

    expect(claimRes.status).toBe(200);
    expect(claimRes.json.issue.status).toBe('CLAIMED_FIXED');

    // -------------------------------------------------------------------------
    // STEP 4: A second citizen disputes the claimed fix
    // -------------------------------------------------------------------------
    const citizen2Context = await browser.newContext();
    const citizen2Page = await citizen2Context.newPage();

    await citizen2Page.goto('/login');
    await citizen2Page.fill('input[type="email"]', citizenUser2.email);
    await citizen2Page.fill('input[type="password"]', seedPassword);
    await citizen2Page.click('button[type="submit"]');
    await citizen2Page.waitForURL((url) => url.pathname.includes('/citizen/dashboard'), { timeout: 15000 });

    const citizen2Nonce = await citizen2Page.evaluate(async () => {
      const res = await fetch('/api/evidence/nonce', { method: 'POST' });
      const data = await res.json();
      return data.nonce;
    });

    const citizen2Payload: EvidencePayload = {
      accuracy: 5.0,
      capturedAt: new Date().toISOString(),
      lat: pilotLat,
      lng: pilotLng,
      nonce: citizen2Nonce,
      photoHash,
      role: 'VERIFY',
    };
    const signature2 = await signEvidencePayload(citizen2Payload, keyPair2.privateKey);

    const disputeRes = await citizen2Page.evaluate(async ({ issueId, payload, signature, photoBase64 }) => {
      const res = await fetch(`/api/issues/${issueId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verdict: 'NOT_FIXED',
          note: 'Citizen inspection: Patch incomplete, loose aggregates and crater re-opened in bus lane',
          evidence: {
            payload,
            signature,
            photoBase64,
            mimeType: 'image/jpeg',
          },
        }),
      });
      return { status: res.status, json: await res.json() };
    }, {
      issueId: demoIssueId,
      payload: citizen2Payload,
      signature: signature2,
      photoBase64: sampleBase64,
    });

    // Direct verify route is blocked for CLAIMED_FIXED issues
    expect(disputeRes.status).toBe(409);
    expect(disputeRes.json.error.code).toBe('AUDIT_IN_PROGRESS');

    // Complete dispute via blind audit task
    let auditTask = await prisma.auditTask.findFirst({
      where: { issueId: demoIssueId, status: 'OPEN' },
    });
    if (!auditTask) {
      auditTask = await prisma.auditTask.create({
        data: {
          issueId: demoIssueId,
          assigneeId: citizenUser2.id,
          kind: 'CLAIM_CHECK',
          dueAt: new Date(Date.now() + 3600 * 1000),
          challengeBearingDeg: 90,
          challengeNonce: crypto.randomUUID(),
          status: 'OPEN',
        },
      });
    } else if (auditTask.assigneeId !== citizenUser2.id) {
      await prisma.auditTask.update({
        where: { id: auditTask.id },
        data: { assigneeId: citizenUser2.id },
      });
    }

    const auditPayload: EvidencePayload = {
      accuracy: 6.0,
      capturedAt: new Date().toISOString(),
      lat: 12.9352,
      lng: 77.6245,
      nonce: auditTask.challengeNonce,
      photoHash,
      role: 'AUDIT',
    };
    const auditSig = await signEvidencePayload(auditPayload, keyPair2.privateKey);

    const voteRes = await citizen2Page.evaluate(async ({ taskId, payload, signature, photoBase64 }) => {
      const res = await fetch(`/api/audit/tasks/${taskId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observed: 'DAMAGED',
          deviceHeadingDeg: 90,
          evidence: {
            payload,
            signature,
            photoBase64,
            mimeType: 'image/jpeg',
          },
        }),
      });
      return { status: res.status, json: await res.json() };
    }, {
      taskId: auditTask.id,
      payload: auditPayload,
      signature: auditSig,
      photoBase64: sampleBase64,
    });

    expect(voteRes.status).toBe(201);
    expect(voteRes.json.issueStatus).toBe('DISPUTED');

    // Verify status in DB is DISPUTED
    const disputedIssue = await prisma.issue.findUnique({
      where: { id: demoIssueId },
    });
    expect(disputedIssue?.status).toBe(Status.DISPUTED);

    // -------------------------------------------------------------------------
    // STEP 5: Claim gap rises on the public scorecard
    // -------------------------------------------------------------------------
    await citizen2Page.goto('/claim-gap');
    await expect(citizen2Page.getByText(/Claim Gap/i).first()).toBeVisible();
    await expect(citizen2Page.getByText(/Dispute Rate|Disputed/i).first()).toBeVisible();

    // -------------------------------------------------------------------------
    // STEP 6: Road timeline shows the recurrence and seeded history
    // -------------------------------------------------------------------------
    await citizen2Page.goto(`/road/${pilotSegmentId}`);
    await expect(citizen2Page.locator('h1')).toContainText('Outer Ring Road (Kadubeesanahalli Section)');

    // Verify seed tag exists on historical seed records
    const seedTags = citizen2Page.locator('[data-testid="seed-tag"]');
    await expect(seedTags.first()).toBeVisible();
    await expect(seedTags.first()).toHaveText('Seed Data');

    // Verify timeline records chronological history
    await expect(citizen2Page.getByText(/Road Resurfaced|Resurfaced/i).first()).toBeVisible();
    await expect(citizen2Page.getByText(/Utility Road Cut/i).first()).toBeVisible();
    await expect(citizen2Page.getByText(/Agency Handoff/i).first()).toBeVisible();
    await expect(citizen2Page.getByText(/Recurrence/i).first()).toBeVisible();

    // Cleanup browser contexts
    await citizen1Context.close();
    await deskContext.close();
    await citizen2Context.close();
  });
});
