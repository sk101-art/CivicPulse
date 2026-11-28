import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { getServerSession } from 'next-auth/next';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AuditKind, AuditTaskStatus, Band, Category, EvidenceRole, Role, Status, Tier } from '@prisma/client';
import {
  MAX_GPS_ACCURACY_METERS,
  MAX_EVIDENCE_DISTANCE_METERS,
  isValidGpsAccuracy,
  isWithinEvidenceDistance,
  getGpsAccuracyWarning,
  getEvidenceDistanceWarning,
} from '@/lib/evidence/locationLimits';
import { signEvidencePayload, computePhotoHash, haversineDistanceM, type EvidencePayload } from '@/lib/evidence/sign';
import { verifyEvidence } from '@/lib/evidence/verify';
import { generateEvidenceNonce } from '@/lib/evidence/nonce';
import { transition, InvalidStateTransitionError } from '@/lib/issues/stateMachine';
import { submitAuditVote } from '@/lib/audit/blindAudit';
import { POST as postReport } from '@/app/api/reports/route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));
const mockedGetSession = vi.mocked(getServerSession);

// Offset latitude by approx `meters` north
function offsetLat(lat: number, meters: number): number {
  return lat + meters / 111_320;
}

describe('500m GPS Accuracy & Capture Distance Policy (REPORT, AUDIT, CLAIM_FIX)', () => {
  const createdUserIds: string[] = [];
  const createdIssueIds: string[] = [];
  const createdNonceValues: string[] = [];
  let citizenId = '';
  let citizenEmail = '';
  let keyPair!: CryptoKeyPair;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.auditVote.deleteMany({ where: { task: { issueId: { in: createdIssueIds } } } }).catch(() => {});
      await prisma.auditTask.deleteMany({ where: { issueId: { in: createdIssueIds } } }).catch(() => {});
      await prisma.actionLog.deleteMany({ where: { issueId: { in: createdIssueIds } } }).catch(() => {});
      await prisma.report.deleteMany({ where: { issueId: { in: createdIssueIds } } }).catch(() => {});
      await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.evidenceNonce.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.deviceKey.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.citizenProfile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
  });

  async function ensureTestCitizen() {
    if (citizenId) return;
    const hash = await bcrypt.hash('password123', 4);
    const tag = Date.now();
    citizenEmail = `loc500-${tag}@example.com`;
    const user = await prisma.user.create({
      data: {
        email: citizenEmail,
        name: 'Loc500 Tester',
        passwordHash: hash,
        role: Role.CITIZEN,
        createdAt: new Date(Date.now() - 72 * 3600 * 1000),
        citizenProfile: { create: { reputation: 0, tier: Tier.CITIZEN } },
      },
    });
    citizenId = user.id;
    createdUserIds.push(user.id);

    keyPair = await crypto.webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const publicJwk = await crypto.webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    await prisma.deviceKey.create({
      data: { userId: citizenId, publicJwk: publicJwk as any },
    });
  }

  it('centralized limits enforce inclusive 0..500m and reject negative, NaN, Infinity, and 501m', () => {
    expect(MAX_GPS_ACCURACY_METERS).toBe(500);
    expect(MAX_EVIDENCE_DISTANCE_METERS).toBe(500);

    for (const v of [0, 10, 30, 118, 250, 500]) {
      expect(isValidGpsAccuracy(v)).toBe(true);
      expect(isWithinEvidenceDistance(v)).toBe(true);
    }

    for (const bad of [-1, -0.1, 500.1, 501, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isValidGpsAccuracy(bad)).toBe(false);
      expect(isWithinEvidenceDistance(bad)).toBe(false);
    }

    expect(getGpsAccuracyWarning(30)).toBeNull();
    expect(getGpsAccuracyWarning(118)).toBe(
      'Your location accuracy is approximately 118 metres. Please confirm the issue location carefully.'
    );
    expect(getEvidenceDistanceWarning(30)).toBeNull();
    expect(getEvidenceDistanceWarning(120)).toBe(
      'You are approximately 120 metres from the reported issue location. Please ensure your evidence clearly shows the correct site.'
    );
  });

  it('verifyEvidence accepts 30m, 118m, 250m, 500m and rejects 501m, negative, NaN, Infinity across REPORT, AUDIT, CLAIM_FIX', async () => {
    await ensureTestCitizen();
    const photoBuffer = Buffer.from('500M-ACCURACY-TEST-BYTES');
    const photoHash = await computePhotoHash(photoBuffer);

    for (const role of ['REPORT', 'AUDIT', 'CLAIM_FIX'] as const) {
      for (const accuracy of [30, 118, 250, 500]) {
        const { nonce } = await generateEvidenceNonce(citizenId);
        createdNonceValues.push(nonce);
        const payload: EvidencePayload = {
          accuracy,
          capturedAt: new Date().toISOString(),
          lat: 12.9352,
          lng: 77.6245,
          nonce,
          photoHash,
          role,
        };
        const signature = await signEvidencePayload(payload, keyPair.privateKey);
        const res = await verifyEvidence(citizenId, payload, signature, photoBuffer, role);
        expect(res.valid).toBe(true);
      }

      for (const badAccuracy of [501, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const { nonce } = await generateEvidenceNonce(citizenId);
        createdNonceValues.push(nonce);
        const payload: EvidencePayload = {
          accuracy: badAccuracy,
          capturedAt: new Date().toISOString(),
          lat: 12.9352,
          lng: 77.6245,
          nonce,
          photoHash,
          role,
        };
        const signature = await signEvidencePayload(payload, keyPair.privateKey);
        const res = await verifyEvidence(citizenId, payload, signature, photoBuffer, role);
        expect(res.valid).toBe(false);
        if (!res.valid) {
          expect(res.reason).toBe('ACCURACY_TOO_LOW');
        }
      }
    }
  });

  it('REPORT API accepts 118m accuracy & <=500m pin offset while preserving real capture coordinates, and rejects 501m', async () => {
    await ensureTestCitizen();
    mockedGetSession.mockResolvedValue({
      user: { id: citizenId, email: citizenEmail, role: Role.CITIZEN },
    } as any);

    const photoBuffer = Buffer.from('REPORT-500M-BYTES');
    const photoBase64 = photoBuffer.toString('base64');
    const photoHash = await computePhotoHash(photoBuffer);
    const captureLat = 12.9352;
    const captureLng = 77.6245;
    const pinLat400 = offsetLat(captureLat, 400);

    const { nonce: okNonce } = await generateEvidenceNonce(citizenId);
    createdNonceValues.push(okNonce);
    const okPayload: EvidencePayload = {
      accuracy: 118,
      capturedAt: new Date().toISOString(),
      lat: pinLat400,
      lng: captureLng,
      nonce: okNonce,
      photoHash,
      role: 'REPORT',
    };
    const okSig = await signEvidencePayload(okPayload, keyPair.privateKey);

    const okRes = await postReport(
      new Request('http://localhost:3000/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: Category.POTHOLES,
          payload: okPayload,
          signature: okSig,
          photoBase64,
          captureCoords: { lat: captureLat, lng: captureLng },
        }),
      })
    );
    expect(okRes.status).toBe(201);
    const okJson = await okRes.json();
    createdIssueIds.push(okJson.issue.id);
    expect(okJson.report.gpsAccuracyM).toBe(118);
    expect(okJson.report.lat).toBeCloseTo(pinLat400, 5);

    // 501m capture-to-pin distance rejected
    const { nonce: farNonce } = await generateEvidenceNonce(citizenId);
    createdNonceValues.push(farNonce);
    const farPayload: EvidencePayload = {
      accuracy: 10,
      capturedAt: new Date().toISOString(),
      lat: offsetLat(captureLat, 505),
      lng: captureLng,
      nonce: farNonce,
      photoHash,
      role: 'REPORT',
    };
    const farSig = await signEvidencePayload(farPayload, keyPair.privateKey);
    const farRes = await postReport(
      new Request('http://localhost:3000/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: Category.POTHOLES,
          payload: farPayload,
          signature: farSig,
          photoBase64,
          captureCoords: { lat: captureLat, lng: captureLng },
        }),
      })
    );
    expect(farRes.status).toBe(400);
  });

  it('CLAIM_FIX state machine accepts <=500m (30, 100, 250, 500) and rejects 501m', () => {
    const baseIssue = {
      id: 'iss-sm-500',
      status: Status.IN_PROGRESS,
      assignedAgencyId: 'ag-1',
    };
    for (const distanceM of [30, 100, 250, 500]) {
      const res = transition(
        baseIssue,
        'CLAIM_FIX',
        { id: 'desk-1', role: 'AUTHORITY' },
        { evidence: { role: 'CLAIM_FIX', distanceM, reportId: 'rep-1' } }
      );
      expect(res.toStatus).toBe(Status.CLAIMED_FIXED);
    }

    expect(() =>
      transition(
        baseIssue,
        'CLAIM_FIX',
        { id: 'desk-1', role: 'AUTHORITY' },
        { evidence: { role: 'CLAIM_FIX', distanceM: 501, reportId: 'rep-1' } }
      )
    ).toThrow(InvalidStateTransitionError);
  });

  it('AUDIT submitAuditVote accepts <=500m with 118m accuracy (without auto-verifying fixed) and rejects 501m', async () => {
    await ensureTestCitizen();
    const issueLat = 12.936;
    const issueLng = 77.625;
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        address: 'Audit 500m Test Rd',
        lat: issueLat,
        lng: issueLng,
        band: Band.MEDIUM,
        status: Status.CLAIMED_FIXED,
        slaDueAt: new Date(Date.now() + 86400_000),
        repairClaimedAt: new Date(Date.now() - 60_000),
      },
    });
    createdIssueIds.push(issue.id);

    const task = await prisma.auditTask.create({
      data: {
        issueId: issue.id,
        kind: AuditKind.CLAIM_CHECK,
        status: AuditTaskStatus.OPEN,
        dueAt: new Date(Date.now() + 86400_000),
        challengeBearingDeg: 90,
        challengeNonce: `nonce-500-${Date.now()}`,
      },
    });

    const photoBuffer = Buffer.from('AUDIT-500M-BYTES');
    const photoBase64 = photoBuffer.toString('base64');
    const photoHash = await computePhotoHash(photoBuffer);

    // 505m away -> rejected
    const farPayload: EvidencePayload = {
      accuracy: 25,
      capturedAt: new Date().toISOString(),
      lat: offsetLat(issueLat, 505),
      lng: issueLng,
      nonce: task.challengeNonce,
      photoHash,
      role: 'AUDIT',
    };
    const farSig = await signEvidencePayload(farPayload, keyPair.privateKey);
    await expect(
      submitAuditVote({
        userId: citizenId,
        taskId: task.id,
        observed: 'INTACT',
        evidence: { payload: farPayload, signature: farSig, photoBase64 },
      })
    ).rejects.toThrow(/within 500m/i);

    // 450m away with 118m accuracy -> accepted, and single vote does NOT mark VERIFIED_FIXED
    const okLat = offsetLat(issueLat, 450);
    expect(haversineDistanceM(issueLat, issueLng, okLat, issueLng)).toBeLessThanOrEqual(500);
    const okPayload: EvidencePayload = {
      accuracy: 118,
      capturedAt: new Date().toISOString(),
      lat: okLat,
      lng: issueLng,
      nonce: task.challengeNonce,
      photoHash,
      role: 'AUDIT',
    };
    const okSig = await signEvidencePayload(okPayload, keyPair.privateKey);
    const voteRes = await submitAuditVote({
      userId: citizenId,
      taskId: task.id,
      observed: 'INTACT',
      evidence: { payload: okPayload, signature: okSig, photoBase64 },
    });
    expect(voteRes.vote.id).toBeTruthy();

    const dbIssue = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(dbIssue?.status).toBe(Status.CLAIMED_FIXED);
  });
});
