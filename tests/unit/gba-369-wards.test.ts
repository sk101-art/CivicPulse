import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { POST as resolveWardPost } from '@/app/api/geo/resolve-ward/route';
import { getWardIntelligence } from '@/lib/intelligence/wardAnalytics';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

const mockedGetSession = vi.mocked(getServerSession);

describe('GBA 369-Ward Directory & Spatial Lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSession.mockResolvedValue({
      user: { id: 'user-test', role: 'CITIZEN', email: 'citizen@civicpulse.in' },
    } as any);
  });

  it('contains exactly 369 active GBA wards across all 5 corporations (63, 72, 50, 72, 112)', async () => {
    const corps = await prisma.corporation.findMany({
      include: {
        _count: {
          select: { wards: { where: { isLegacy: false, isOperationalArea: false } } },
        },
      },
    });

    const byShortName = Object.fromEntries(corps.map((c) => [c.shortName, c._count.wards]));
    expect(byShortName).toEqual({
      Central: 63,
      North: 72,
      East: 50,
      South: 72,
      West: 112,
    });

    const total = Object.values(byShortName).reduce((a, b) => a + b, 0);
    expect(total).toBe(369);
  });

  it('has valid PostGIS MultiPolygon geometries for all 369 GBA wards', async () => {
    const [{ invalid_count }] = await prisma.$queryRaw<Array<{ invalid_count: number }>>`
      SELECT COUNT(*)::int AS invalid_count
      FROM "Ward"
      WHERE "isLegacy" = false
        AND "isOperationalArea" = false
        AND "geometrySource" = 'GBA_2025_DELIMITATION'
        AND (geom IS NULL OR NOT ST_IsValid(geom::geometry));
    `;
    expect(invalid_count).toBe(0);
  });

  it('resolves real GBA ward polygons via POST /api/geo/resolve-ward with corporation metadata', async () => {
    const sampleWards = await prisma.$queryRaw<
      Array<{ id: string; code: string; wardNumber: number; name: string; corpName: string; lat: number; lng: number }>
    >`
      SELECT w.id, w.code, w."wardNumber", w.name, c.name AS "corpName",
             ST_Y(ST_PointOnSurface(w.geom::geometry)) AS lat,
             ST_X(ST_PointOnSurface(w.geom::geometry)) AS lng
      FROM "Ward" w
      JOIN "Corporation" c ON c.id = w."corporationId"
      WHERE w."isLegacy" = false AND w."isOperationalArea" = false AND w.geom IS NOT NULL
      ORDER BY w.code ASC
      LIMIT 5;
    `;

    expect(sampleWards.length).toBe(5);

    for (const expected of sampleWards) {
      const req = new Request('http://localhost:3000/api/geo/resolve-ward', {
        method: 'POST',
        body: JSON.stringify({ lat: expected.lat, lng: expected.lng }),
      });
      const res = await resolveWardPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.matched).toBe(true);
      expect(json.ward.id).toBe(expected.id);
      expect(json.ward.code).toBe(expected.code);
      expect(json.ward.corporationName).toBe(expected.corpName);
    }
  });

  it('computes Ward Intelligence for any imported GBA ward without errors', async () => {
    const gbaWard = await prisma.ward.findFirst({
      where: { isLegacy: false, isOperationalArea: false },
      orderBy: { code: 'asc' },
    });
    expect(gbaWard).not.toBeNull();
    if (gbaWard) {
      const intel = await getWardIntelligence(gbaWard.code, 'all', 'CITIZEN');
      expect(intel).not.toBeNull();
      expect(intel?.ward.id).toBe(gbaWard.id);
      expect(intel?.overview.totalIssues).toBeGreaterThanOrEqual(0);
    }
  });
});
