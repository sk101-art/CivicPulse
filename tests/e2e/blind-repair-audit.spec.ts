import { test, expect } from '@playwright/test';
import { createSeedDb } from '../../scripts/lib/db-target';
import { Status, Category, Band, EvidenceRole, AuditKind } from '@prisma/client';
import crypto from 'crypto';
import { signEvidencePayload, type EvidencePayload } from '../../src/lib/evidence/sign';
import { seedDemoData } from '../../scripts/seed-demo';

// Always the isolated test schema; fails fast instead of falling back to production.
const { pool, prisma, verify: verifyTestDb } = createSeedDb();
test.beforeAll(async () => {
  await verifyTestDb();
});

const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

test.describe('Track B Novelty: Blind Repair Audit & Contractor Liability End-to-End', () => {
  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];

  test.beforeAll(async () => {
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

  test('Claim fix -> 3 blind audit tasks -> votes -> VERIFIED_FIXED -> durability DAMAGED -> REOPENED_IN_WARRANTY -> liability package loads', async ({ browser, baseURL }) => {
    const lat = 12.9355;
    const lng = 77.6890;
    const now = Date.now();

    // 1. Setup actors
    const deskOfficer = await prisma.user.findFirstOrThrow({ where: { email: 'desk-a@civicpulse.local' } });
    const citizen1 = await prisma.user.findFirstOrThrow({ where: { email: 'citizen@example.com' } });
    const citizen2 = await prisma.user.findFirstOrThrow({ where: { email: 'citizen-b@civicpulse.local' } });
    const citizen3 = await prisma.user.findFirstOrThrow({ where: { email: 'citizen-c@civicpulse.local' } });

    // Setup device keys for signing
    const keyPairDesk = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const jwkDesk = await globalThis.crypto.subtle.exportKey('jwk', keyPairDesk.publicKey);
    await prisma.deviceKey.create({
      data: { userId: deskOfficer.id, publicJwk: jwkDesk as object },
    });

    const keyPairCitizen2 = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const jwkCitizen2 = await globalThis.crypto.subtle.exportKey('jwk', keyPairCitizen2.publicKey);
    await prisma.deviceKey.create({
      data: { userId: citizen2.id, publicJwk: jwkCitizen2 as object },
    });

    const keyPairCitizen3 = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const jwkCitizen3 = await globalThis.crypto.subtle.exportKey('jwk', keyPairCitizen3.publicKey);
    await prisma.deviceKey.create({
      data: { userId: citizen3.id, publicJwk: jwkCitizen3 as object },
    });

    // 2. Create confirmed issue reported by Citizen 1
    const testIssue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.CONFIRMED,
        lat,
        lng,
        address: 'ORR Outer Ring Road near Ecospace Gate 3',
        priority: 75.0,
        band: Band.HIGH,
        slaDueAt: new Date(now + 72 * 3600 * 1000),
        reports: {
          create: {
            userId: citizen1.id,
            role: EvidenceRole.REPORT,
            photoUrl: 'https://placehold.co/600x400.jpg',
            photoSha256: 'initial_hash_placeholder',
            signature: 'initial_sig_placeholder',
            lat,
            lng,
            gpsAccuracyM: 5.0,
            capturedAt: new Date(),
          },
        },
      },
    });
    createdIssueIds.push(testIssue.id);

    // 3. Desk A claims fix with signed photo evidence, contractor name, and tender ID
    const deskContext = await browser.newContext();
    const deskPage = await deskContext.newPage();
    await deskPage.goto(`${baseURL}/login`);
    await deskPage.fill('input[type="email"]', 'desk-a@civicpulse.local');
    await deskPage.fill('input[type="password"]', seedPassword);
    await deskPage.click('button[type="submit"]');
    await deskPage.waitForURL(`${baseURL}/desk`);

    // Claim fix via desk action API with signed photo
    const claimPhotoBuffer = Buffer.from('synthetic_claim_fix_photo');
    const claimPhotoHash = crypto.createHash('sha256').update(claimPhotoBuffer).digest('hex');
    const deskNonceRes = await deskPage.evaluate(async () => {
      const res = await fetch('/api/evidence/nonce', { method: 'POST' });
      return { status: res.status, data: await res.json() };
    });
    expect(deskNonceRes.status).toBe(201);
    const claimNonce = deskNonceRes.data.nonce;

    const claimPayload: EvidencePayload = {
      accuracy: 5.0,
      capturedAt: new Date().toISOString(),
      lat,
      lng,
      nonce: claimNonce,
      photoHash: claimPhotoHash,
      role: 'CLAIM_FIX',
    };
    const claimSignature = await signEvidencePayload(claimPayload, keyPairDesk.privateKey);

    const claimActionRes = await deskPage.evaluate(async ({ issueId, body }) => {
      const res = await fetch(`/api/issues/${issueId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json() };
    }, {
      issueId: testIssue.id,
      body: {
        action: 'CLAIM_FIX',
        note: 'Asphalt patching complete with bitumen seal coat',
        contractorName: 'Cauvery Infrastructure Ltd.',
        tenderId: 'BBMP/EE/RRD/2026-27/W-4192',
        evidence: {
          payload: claimPayload,
          signature: claimSignature,
          photoBase64: claimPhotoBuffer.toString('base64'),
          mimeType: 'image/jpeg',
        },
      },
    });
    if (claimActionRes.status !== 200) {
      console.error("CLAIM ACTION FAILED:", JSON.stringify(claimActionRes.json));
    }
    expect(claimActionRes.status).toBe(200);

    // 4. Verify 3 blind audit tasks were created
    const tasks = await prisma.auditTask.findMany({
      where: { issueId: testIssue.id },
    });
    expect(tasks).toHaveLength(3);
    for (const t of tasks) {
      expect(t.status).toBe('OPEN');
      expect(t.kind).toBe('CLAIM_CHECK');
      expect(t.challengeBearingDeg).toBeGreaterThanOrEqual(0);
      expect(t.challengeBearingDeg).toBeLessThan(360);
      expect(t.challengeNonce).toBeTruthy();
    }

    // 5. Citizen 2 logs in and views blind audit tasks
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    await citizenPage.goto(`${baseURL}/login`);
    await citizenPage.fill('input[type="email"]', 'citizen-b@civicpulse.local');
    await citizenPage.fill('input[type="password"]', seedPassword);
    await citizenPage.click('button[type="submit"]');
    await citizenPage.waitForURL(`${baseURL}/citizen/dashboard`);

    // Fetch blind tasks via API
    const blindTasksRes = await citizenPage.request.get(`/api/audit/tasks?lat=${lat}&lng=${lng}`);
    expect(blindTasksRes.status()).toBe(200);
    const blindTasksData = await blindTasksRes.json();
    const targetBlindTask = blindTasksData.tasks.find((t: { id: string }) => t.id === tasks[0].id);
    expect(targetBlindTask).toBeDefined();

    // Verify BLINDNESS: no status, no contractor, no claim dates
    expect(targetBlindTask.status).toBe('OPEN'); // task status only
    expect(targetBlindTask.challengeBearingDeg).toBe(tasks[0].challengeBearingDeg);
    expect(targetBlindTask.challengeNonce).toBe(tasks[0].challengeNonce);
    expect((targetBlindTask as Record<string, unknown>).issueStatus).toBeUndefined();
    expect((targetBlindTask as Record<string, unknown>).contractorName).toBeUndefined();

    // 6. Submit Audit Votes (INTACT) to achieve VERIFIED_FIXED
    // Set auditor reliabilities to 0.8
    await prisma.auditorScore.upsert({
      where: { userId: citizen2.id },
      create: { userId: citizen2.id, controlsPassed: 3, controlsTotal: 3, reliability: 0.8 },
      update: { reliability: 0.8 },
    });
    await prisma.auditorScore.upsert({
      where: { userId: citizen3.id },
      create: { userId: citizen3.id, controlsPassed: 3, controlsTotal: 3, reliability: 0.8 },
      update: { reliability: 0.8 },
    });

    // Vote 1: Citizen 2
    const auditPhotoBuffer1 = Buffer.from('audit_photo_citizen_2');
    const photoHash1 = crypto.createHash('sha256').update(auditPhotoBuffer1).digest('hex');
    const auditPayload1: EvidencePayload = {
      accuracy: 6.0,
      capturedAt: new Date().toISOString(),
      lat,
      lng,
      nonce: tasks[0].challengeNonce,
      photoHash: photoHash1,
      role: 'AUDIT',
    };
    const auditSig1 = await signEvidencePayload(auditPayload1, keyPairCitizen2.privateKey);

    const vote1Res = await citizenPage.evaluate(async ({ taskId, body }) => {
      const res = await fetch(`/api/audit/tasks/${taskId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json() };
    }, {
      taskId: tasks[0].id,
      body: {
        observed: 'INTACT',
        deviceHeadingDeg: tasks[0].challengeBearingDeg,
        evidence: {
          payload: auditPayload1,
          signature: auditSig1,
          photoBase64: auditPhotoBuffer1.toString('base64'),
          mimeType: 'image/jpeg',
        },
      },
    });
    expect([200, 201]).toContain(vote1Res.status);

    // Vote 2: Citizen 3 (reaches weighted INTACT = 1.6 >= 1.5)
    const citizen3Context = await browser.newContext();
    const citizen3Page = await citizen3Context.newPage();
    await citizen3Page.goto(`${baseURL}/login`);
    await citizen3Page.fill('input[type="email"]', 'citizen-c@civicpulse.local');
    await citizen3Page.fill('input[type="password"]', seedPassword);
    await citizen3Page.click('button[type="submit"]');
    await citizen3Page.waitForURL(`${baseURL}/citizen/dashboard`);

    const auditPhotoBuffer2 = Buffer.from('audit_photo_citizen_3');
    const photoHash2 = crypto.createHash('sha256').update(auditPhotoBuffer2).digest('hex');
    const auditPayload2: EvidencePayload = {
      accuracy: 7.0,
      capturedAt: new Date().toISOString(),
      lat,
      lng,
      nonce: tasks[1].challengeNonce,
      photoHash: photoHash2,
      role: 'AUDIT',
    };
    const auditSig2 = await signEvidencePayload(auditPayload2, keyPairCitizen3.privateKey);

    const vote2Res = await citizen3Page.evaluate(async ({ taskId, body }) => {
      const res = await fetch(`/api/audit/tasks/${taskId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json() };
    }, {
      taskId: tasks[1].id,
      body: {
        observed: 'INTACT',
        deviceHeadingDeg: tasks[1].challengeBearingDeg,
        evidence: {
          payload: auditPayload2,
          signature: auditSig2,
          photoBase64: auditPhotoBuffer2.toString('base64'),
          mimeType: 'image/jpeg',
        },
      },
    });
    expect([200, 201]).toContain(vote2Res.status);

    // Verify issue status automatically transitioned to VERIFIED_FIXED
    const verifiedIssue = await prisma.issue.findUniqueOrThrow({ where: { id: testIssue.id } });
    expect(verifiedIssue.status).toBe(Status.VERIFIED_FIXED);

    // 7. Durability Check: defect deteriorates during warranty
    const durabilityTask = await prisma.auditTask.create({
      data: {
        issueId: testIssue.id,
        assigneeId: citizen2.id,
        kind: AuditKind.DURABILITY,
        dueAt: new Date(now + 48 * 3600 * 1000),
        challengeBearingDeg: 180,
        challengeNonce: 'durability-challenge-nonce-xyz',
        status: 'OPEN',
      },
    });

    // Auditor finds it DAMAGED with weight >= 1.0
    await prisma.auditorScore.update({
      where: { userId: citizen2.id },
      data: { reliability: 1.0 },
    });

    const durabilityPhoto = Buffer.from('durability_pothole_reopened');
    const durPhotoHash = crypto.createHash('sha256').update(durabilityPhoto).digest('hex');
    const durPayload: EvidencePayload = {
      accuracy: 5.0,
      capturedAt: new Date().toISOString(),
      lat,
      lng,
      nonce: durabilityTask.challengeNonce,
      photoHash: durPhotoHash,
      role: 'AUDIT',
    };
    const durSig = await signEvidencePayload(durPayload, keyPairCitizen2.privateKey);

    const durRes = await citizenPage.evaluate(async ({ taskId, body }) => {
      const res = await fetch(`/api/audit/tasks/${taskId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json() };
    }, {
      taskId: durabilityTask.id,
      body: {
        observed: 'DAMAGED',
        deviceHeadingDeg: 180,
        evidence: {
          payload: durPayload,
          signature: durSig,
          photoBase64: durabilityPhoto.toString('base64'),
          mimeType: 'image/jpeg',
        },
      },
    });
    expect([200, 201]).toContain(durRes.status);

    // Verify issue transitioned to REOPENED_IN_WARRANTY and lifespanDays calculated
    const reopenedIssue = await prisma.issue.findUniqueOrThrow({ where: { id: testIssue.id } });
    expect(reopenedIssue.status).toBe(Status.REOPENED_IN_WARRANTY);
    expect(reopenedIssue.lifespanDays).toBeGreaterThanOrEqual(1);

    // 8. Desk loads printable Contractor Liability Package
    const liabilityRes = await deskPage.evaluate(async (issueId) => {
      const res = await fetch(`/api/issues/${issueId}/liability`);
      return { status: res.status, text: await res.text() };
    }, testIssue.id);
    expect(liabilityRes.status).toBe(200);
    const liabilityHtml = liabilityRes.text;

    expect(liabilityHtml).toContain('Defect Liability Evidence Report');
    expect(liabilityHtml).toContain('Cauvery Infrastructure Ltd.');
    expect(liabilityHtml).toContain('BBMP/EE/RRD/2026-27/W-4192');
    expect(liabilityHtml).toContain('the defect liability clause of the contract');
    expect(liabilityHtml).not.toContain('Clause 38');
    expect(liabilityHtml).toContain('Generated by CivicPulse from signed citizen audit evidence. To be issued by the competent authority.');
    expect(liabilityHtml).toContain('REOPENED IN WARRANTY');

    await deskContext.close();
    await citizenContext.close();
    await citizen3Context.close();
  });
});
