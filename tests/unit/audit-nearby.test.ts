import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth/next';
import { GET } from '@/app/api/audit/nearby/route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

const mockedGetSession = vi.mocked(getServerSession);

describe('GET /api/audit/nearby', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockedGetSession.mockResolvedValueOnce(null);
    const req = new Request('http://localhost:3000/api/audit/nearby?lat=12.9716&lng=77.5946&radiusM=2000');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('rejects invalid coordinates or radius with 400', async () => {
    const citizen = await prisma.user.findFirst({ where: { role: 'CITIZEN' } });
    expect(citizen).not.toBeNull();
    mockedGetSession.mockResolvedValueOnce({
      user: { id: citizen!.id, role: 'CITIZEN', email: citizen!.email },
    } as any);

    const req = new Request('http://localhost:3000/api/audit/nearby?lat=200&lng=77.5946&radiusM=2000');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns only eligible CLAIMED_FIXED tasks within radius sorted nearest-first, plus real submissions', async () => {
    const citizen = await prisma.user.findFirst({
      where: {
        role: 'CITIZEN',
        createdAt: { lt: new Date(Date.now() - 48 * 3600 * 1000) },
      },
    });
    expect(citizen).not.toBeNull();

    mockedGetSession.mockResolvedValue({
      user: { id: citizen!.id, role: 'CITIZEN', email: citizen!.email },
    } as any);

    const req = new Request('http://localhost:3000/api/audit/nearby?lat=12.9716&lng=77.5946&radiusM=10000');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.eligible).toBe(true);
    expect(Array.isArray(json.tasks)).toBe(true);
    expect(Array.isArray(json.submissions)).toBe(true);

    // Every returned task must be CLAIMED_FIXED and <= 10000m away, sorted nearest-first, and blind
    let prevDist = -1;
    for (const t of json.tasks) {
      expect(t.status).toBe('CLAIMED_FIXED');
      expect(t.distanceM).not.toBeNull();
      expect(t.distanceM).toBeLessThanOrEqual(10000);
      expect(t.distanceM).toBeGreaterThanOrEqual(prevDist);
      expect(t.originalPhotoUrl).toBeUndefined();
      expect(t.repairPhotoUrl).toBeUndefined();
      expect(t.contractorName).toBeUndefined();
      expect(t.agencyName).toBeUndefined();
      expect(t.tenderId).toBeUndefined();
      expect(t.repairClaimedAt).toBeUndefined();
      prevDist = t.distanceM;
    }
  });

  it('returns locationRequired: true and empty tasks in NEARBY mode when coordinates are missing', async () => {
    const citizen = await prisma.user.findFirst({
      where: {
        role: 'CITIZEN',
        createdAt: { lt: new Date(Date.now() - 48 * 3600 * 1000) },
      },
    });
    expect(citizen).not.toBeNull();

    mockedGetSession.mockResolvedValueOnce({
      user: { id: citizen!.id, role: 'CITIZEN', email: citizen!.email },
    } as any);

    const req = new Request('http://localhost:3000/api/audit/nearby?mode=NEARBY&radiusM=2000');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eligible).toBe(true);
    expect(json.locationRequired).toBe(true);
    expect(json.tasks).toEqual([]);
  });
});
