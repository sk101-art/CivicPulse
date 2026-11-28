import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth/next';
import { GET } from '@/app/api/geo/context/route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

const mockedGetSession = vi.mocked(getServerSession);

describe('GET /api/geo/context (No Default Operational Area)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not select ORR Corridor / PILOT-ORR by default for AUTHORITY users', async () => {
    const staff = await prisma.user.findFirst({ where: { role: 'AUTHORITY' } });
    expect(staff).not.toBeNull();

    mockedGetSession.mockResolvedValue({
      user: { id: staff!.id, role: 'AUTHORITY', email: staff!.email },
    } as any);

    const res = await GET(new Request('http://localhost:3000/api/geo/context'));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.role).toBe('AUTHORITY');
    expect(json.current.id).toBe('zone-all');
    expect(json.current.code).toBe('ALL');
    expect(json.current.isOperationalArea).toBe(false);
    expect(json.current.code).not.toBe('PILOT-ORR');

    // Operational areas remain available as explicit selectable options
    expect(Array.isArray(json.operationalAreas)).toBe(true);
    expect(json.operationalAreas.some((a: any) => a.code === 'PILOT-ORR')).toBe(true);

    // Municipal wards list does not mix operational areas into the default ward list
    expect(json.available.some((w: any) => w.code === 'PILOT-ORR')).toBe(false);
  });

  it('does not hardcode ORR in desk-b assignedZone', async () => {
    mockedGetSession.mockResolvedValue({
      user: { id: 'desk-b-id', role: 'AUTHORITY', email: 'desk-b@civicpulse.local' },
    } as any);

    const res = await GET(new Request('http://localhost:3000/api/geo/context'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.department.assignedZone).not.toContain('ORR');
  });
});
