import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth/next';
import { POST } from '@/app/api/geo/resolve-ward/route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

const mockedGetSession = vi.mocked(getServerSession);

describe('POST /api/geo/resolve-ward (PostGIS)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSession.mockResolvedValue({
      user: { id: 'user-test', role: 'CITIZEN', email: 'citizen@civicpulse.in' },
    } as any);
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockedGetSession.mockResolvedValueOnce(null);
    const req = new Request('http://localhost:3000/api/geo/resolve-ward', {
      method: 'POST',
      body: JSON.stringify({ lat: 12.9716, lng: 77.5946 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects malformed or out-of-range coordinates with 400', async () => {
    const req = new Request('http://localhost:3000/api/geo/resolve-ward', {
      method: 'POST',
      body: JSON.stringify({ lat: 120, lng: 77.5946 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('INVALID_COORDINATES');
  });

  it('resolves a PostGIS MultiPolygon ward via ST_Covers and preserves operationalArea separately', async () => {
    const tempId = `test-ward-postgis-${Date.now()}`;
    const tempCode = `WARD-TEST-${Date.now()}`;
    const polygonGeoJson = JSON.stringify({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [77.6749, 12.9299],
            [77.6751, 12.9299],
            [77.6751, 12.9301],
            [77.6749, 12.9301],
            [77.6749, 12.9299],
          ],
        ],
      ],
    });

    await prisma.$executeRaw`
      INSERT INTO "Ward" ("id", "code", "name", "geom")
      VALUES (
        ${tempId},
        ${tempCode},
        'Bellandur Test Polygon',
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${polygonGeoJson}), 4326))::geography
      );
    `;

    try {
      // Point inside both the test municipal ward polygon and PILOT-ORR operational area
      const req = new Request('http://localhost:3000/api/geo/resolve-ward', {
        method: 'POST',
        body: JSON.stringify({ lat: 12.93, lng: 77.675 }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.matched).toBe(true);
      expect(json.ward).toBeTruthy();
      expect(json.ward.id).toBe(tempId);
      expect(json.ward.code).toBe(tempCode);
      expect(json.ward.isPilot).toBe(false);
      // Operational area (PILOT-ORR) is returned separately if present, never mixed into ward
      if (json.operationalArea) {
        expect(json.operationalArea.code).toBe('PILOT-ORR');
      }

      // Point outside all ward polygons must not fabricate a ward
      const outsideReq = new Request('http://localhost:3000/api/geo/resolve-ward', {
        method: 'POST',
        body: JSON.stringify({ lat: 28.6139, lng: 77.209 }),
      });
      const outsideRes = await POST(outsideReq);
      expect(outsideRes.status).toBe(200);
      const outsideJson = await outsideRes.json();
      expect(outsideJson.matched).toBe(false);
      expect(outsideJson.ward).toBeNull();
      expect(outsideJson.reason).toBe('OUTSIDE_WARD_BOUNDARIES');
    } finally {
      await prisma.$executeRaw`DELETE FROM "Ward" WHERE id = ${tempId};`;
    }
  });

  it('returns matched: false without fabricating a ward when outside mapped boundaries or boundaries are unavailable', async () => {
    const req = new Request('http://localhost:3000/api/geo/resolve-ward', {
      method: 'POST',
      body: JSON.stringify({ lat: 28.6139, lng: 77.209 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matched).toBe(false);
    expect(json.ward).toBeNull();
    expect(['OUTSIDE_WARD_BOUNDARIES', 'WARD_BOUNDARIES_UNAVAILABLE']).toContain(json.reason);
  });
});
