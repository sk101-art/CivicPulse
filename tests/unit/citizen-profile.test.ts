import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { getServerSession } from 'next-auth/next';
import bcrypt from 'bcryptjs';
import { Band, Category, EvidenceRole, Role, Status, Tier } from '@prisma/client';
import { PATCH as patchProfile } from '@/app/api/citizen/profile/route';
import { GET as getCitizenReports } from '@/app/api/citizen/reports/route';
import { loadCitizenOverview, loadLeaderboard } from '@/lib/citizen/stats';
import { nextTierProgress } from '@/lib/citizen/statsPure';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

const mockedGetSession = vi.mocked(getServerSession);

describe('Page 7: Citizen Profile API, Stats, and Pagination (Test Schema)', () => {
  const createdUserIds: string[] = [];
  const createdIssueIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.report.deleteMany({ where: { issueId: { in: createdIssueIds } } }).catch(() => {});
      await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.citizenProfile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
  });

  it('rejects unauthenticated (401) and non-citizen (403) profile updates', async () => {
    mockedGetSession.mockResolvedValueOnce(null);
    const unauthRes = await patchProfile(
      new Request('http://localhost:3000/api/citizen/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test User' }),
      })
    );
    expect(unauthRes.status).toBe(401);

    mockedGetSession.mockResolvedValueOnce({
      user: { id: 'staff-1', email: 'staff@civicpulse.local', role: Role.AUTHORITY },
    } as any);
    const staffRes = await patchProfile(
      new Request('http://localhost:3000/api/citizen/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Staff Name' }),
      })
    );
    expect(staffRes.status).toBe(403);
  });

  it('validates display names, updates only the authenticated user, and ignores client userId', async () => {
    const hash = await bcrypt.hash('password123', 4);
    const tag = Date.now();
    const userA = await prisma.user.create({
      data: {
        email: `profile-a-${tag}@example.com`,
        name: 'Original Name A',
        passwordHash: hash,
        role: Role.CITIZEN,
        citizenProfile: { create: { reputation: 0, tier: Tier.CITIZEN } },
      },
    });
    const userB = await prisma.user.create({
      data: {
        email: `profile-b-${tag}@example.com`,
        name: 'Original Name B',
        passwordHash: hash,
        role: Role.CITIZEN,
        citizenProfile: { create: { reputation: 0, tier: Tier.CITIZEN } },
      },
    });
    createdUserIds.push(userA.id, userB.id);

    mockedGetSession.mockResolvedValue({
      user: { id: userA.id, email: userA.email, role: Role.CITIZEN },
    } as any);

    // Reject empty / whitespace / invalid characters
    for (const badName of ['', '   ', 'A', '<script>alert(1)</script>']) {
      const badRes = await patchProfile(
        new Request('http://localhost:3000/api/citizen/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: badName }),
        })
      );
      expect(badRes.status).toBe(400);
    }

    // Valid update ignores spoofed userId and updates only userA
    const okRes = await patchProfile(
      new Request('http://localhost:3000/api/citizen/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '  Updated Citizen A  ', userId: userB.id }),
      })
    );
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.user.name).toBe('Updated Citizen A');

    const dbA = await prisma.user.findUnique({ where: { id: userA.id } });
    const dbB = await prisma.user.findUnique({ where: { id: userB.id } });
    expect(dbA?.name).toBe('Updated Citizen A');
    expect(dbB?.name).toBe('Original Name B');
  });

  it('returns real zero counts, excludes CLAIMED_FIXED from verifiedFixedCount, hides emails on leaderboard, and paginates without duplicates', async () => {
    const hash = await bcrypt.hash('password123', 4);
    const tag = Date.now();
    const zeroUser = await prisma.user.create({
      data: {
        email: `zero-${tag}@example.com`,
        name: 'Zero Activity',
        passwordHash: hash,
        role: Role.CITIZEN,
        citizenProfile: { create: { reputation: 0, tier: Tier.CITIZEN } },
      },
    });
    const activeUser = await prisma.user.create({
      data: {
        email: `active-${tag}@example.com`,
        name: 'Active Citizen',
        passwordHash: hash,
        role: Role.CITIZEN,
        citizenProfile: { create: { reputation: 250, tier: Tier.CONTRIBUTOR } },
      },
    });
    createdUserIds.push(zeroUser.id, activeUser.id);

    const zeroOverview = await loadCitizenOverview(zeroUser.id);
    expect(zeroOverview.reportsFiled).toBe(0);
    expect(zeroOverview.verifiedFixedCount).toBe(0);
    expect(zeroOverview.votesCast).toBe(0);
    expect(zeroOverview.profile?.reputation).toBe(0);

    // Create 3 issues for activeUser: CLAIMED_FIXED, VERIFIED_FIXED, OPEN (with duplicate CONFIRM on OPEN)
    const now = Date.now();
    const issClaimed = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        address: `Claimed Rd ${tag}`,
        lat: 12.97,
        lng: 77.59,
        band: Band.MEDIUM,
        status: Status.CLAIMED_FIXED,
        slaDueAt: new Date(now + 86400_000),
        createdAt: new Date(now - 3000),
      },
    });
    const issVerified = await prisma.issue.create({
      data: {
        category: Category.DRAINAGE,
        address: `Verified Rd ${tag}`,
        lat: 12.971,
        lng: 77.591,
        band: Band.HIGH,
        status: Status.VERIFIED_FIXED,
        slaDueAt: new Date(now + 86400_000),
        createdAt: new Date(now - 2000),
      },
    });
    const issOpen = await prisma.issue.create({
      data: {
        category: Category.STREETLIGHTS,
        address: `Open Rd ${tag}`,
        lat: 12.972,
        lng: 77.592,
        band: Band.LOW,
        status: Status.OPEN,
        slaDueAt: new Date(now + 86400_000),
        createdAt: new Date(now - 1000),
      },
    });
    createdIssueIds.push(issClaimed.id, issVerified.id, issOpen.id);

    await prisma.report.createMany({
      data: [
        {
          issueId: issClaimed.id,
          userId: activeUser.id,
          role: EvidenceRole.REPORT,
          photoUrl: '/uploads/p1.jpg',
          photoSha256: `sha1-${tag}`,
          signature: 's1',
          nonce: `n1-${tag}`,
          lat: 12.97,
          lng: 77.59,
          gpsAccuracyM: 5,
          capturedAt: new Date(now - 3000),
        },
        {
          issueId: issVerified.id,
          userId: activeUser.id,
          role: EvidenceRole.REPORT,
          photoUrl: '/uploads/p2.jpg',
          photoSha256: `sha2-${tag}`,
          signature: 's2',
          nonce: `n2-${tag}`,
          lat: 12.971,
          lng: 77.591,
          gpsAccuracyM: 5,
          capturedAt: new Date(now - 2000),
        },
        {
          issueId: issOpen.id,
          userId: activeUser.id,
          role: EvidenceRole.REPORT,
          photoUrl: '/uploads/p3.jpg',
          photoSha256: `sha3-${tag}`,
          signature: 's3',
          nonce: `n3-${tag}`,
          lat: 12.972,
          lng: 77.592,
          gpsAccuracyM: 5,
          capturedAt: new Date(now - 1000),
        },
        {
          issueId: issOpen.id,
          userId: activeUser.id,
          role: EvidenceRole.CONFIRM,
          photoUrl: '/uploads/p4.jpg',
          photoSha256: `sha4-${tag}`,
          signature: 's4',
          nonce: `n4-${tag}`,
          lat: 12.972,
          lng: 77.592,
          gpsAccuracyM: 5,
          capturedAt: new Date(now - 500),
        },
      ],
    });

    const activeOverview = await loadCitizenOverview(activeUser.id);
    expect(activeOverview.reportsFiled).toBe(3);
    // CLAIMED_FIXED must NOT be counted as verifiedFixedCount
    expect(activeOverview.verifiedFixedCount).toBe(1);

    // Paginate /api/citizen/reports (limit=2) -> zero duplicate issues, zero skipped issues
    mockedGetSession.mockResolvedValue({
      user: { id: activeUser.id, email: activeUser.email, role: Role.CITIZEN },
    } as any);

    const page1Res = await getCitizenReports(
      new Request('http://localhost:3000/api/citizen/reports?page=1&limit=2')
    );
    expect(page1Res.status).toBe(200);
    const page1 = await page1Res.json();
    expect(page1.total).toBe(3);
    expect(page1.hasMore).toBe(true);
    expect(page1.items).toHaveLength(2);

    const page2Res = await getCitizenReports(
      new Request('http://localhost:3000/api/citizen/reports?page=2&limit=2')
    );
    expect(page2Res.status).toBe(200);
    const page2 = await page2Res.json();
    expect(page2.hasMore).toBe(false);
    expect(page2.items).toHaveLength(1);

    const allIds = [...page1.items, ...page2.items].map((i: { issueId: string }) => i.issueId);
    expect(new Set(allIds).size).toBe(3);

    // Leaderboard never exposes emails
    const lb = await loadLeaderboard(activeUser.id, 250);
    for (const row of lb.rows) {
      expect(row.name).not.toContain('@');
    }

    // Tier progression matches statsPure.ts
    expect(nextTierProgress(0)).toMatchObject({ tier: 'CITIZEN', next: 'CONTRIBUTOR', pointsToNext: 200 });
    expect(nextTierProgress(250)).toMatchObject({ tier: 'CONTRIBUTOR', next: 'GUARDIAN', pointsToNext: 250 });
    expect(nextTierProgress(1000)).toMatchObject({ tier: 'AMBASSADOR', next: null, pointsToNext: 0, pct: 100 });
  });
});
