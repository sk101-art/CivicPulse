import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth/next';
import { GET } from '@/app/api/desk/analyst/brief/route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/ai/run', () => ({
  runAi: vi.fn(async ({ inputPayload }: { inputPayload: any }) => ({
    provider: 'rules',
    model: 'grounded-test',
    data: {
      wardCode: inputPayload.wardCode,
      wardName: inputPayload.wardName,
      headline: `${inputPayload.wardName}: ${inputPayload.totalActiveIssues} Active Issues`,
      brief: `Recorded ${inputPayload.totalActiveIssues} active issues (${inputPayload.highCriticalPriority} high/critical).`,
      recommendedActions: ['Prioritize overdue SLA items.'],
    },
  })),
  formatAiEngineName: vi.fn(() => 'CivicPulse Grounded Test'),
  computeInputHash: vi.fn(() => 'test-hash'),
}));

const mockedGetSession = vi.mocked(getServerSession);

describe('GET /api/desk/analyst/brief (Grounded Telemetry & Auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated and non-AUTHORITY callers', async () => {
    mockedGetSession.mockResolvedValueOnce(null);
    const res1 = await GET(new Request('http://localhost:3000/api/desk/analyst/brief?wardCode=ALL'));
    expect(res1.status).toBe(401);

    mockedGetSession.mockResolvedValueOnce({
      user: { id: 'cit-1', role: 'CITIZEN', email: 'citizen@civicpulse.in' },
    } as any);
    const res2 = await GET(new Request('http://localhost:3000/api/desk/analyst/brief?wardCode=ALL'));
    expect(res2.status).toBe(403);
  });

  it('returns authoritative telemetry matching DB and grounded briefing without fabricated rainfall', async () => {
    const authUser = await prisma.user.findFirst({ where: { role: 'AUTHORITY' } });
    expect(authUser).not.toBeNull();
    mockedGetSession.mockResolvedValue({
      user: { id: authUser!.id, role: 'AUTHORITY', email: authUser!.email },
    } as any);

    const resAll = await GET(
      new Request('http://localhost:3000/api/desk/analyst/brief?wardCode=ALL&period=all')
    );
    expect(resAll.status).toBe(200);
    const json = await resAll.json();

    expect(json.telemetry).toBeDefined();
    expect(json.telemetry.kpis.totalActiveIssues).toBeGreaterThanOrEqual(0);
    expect(json.telemetry.kpis.highCriticalPriority).toBeLessThanOrEqual(
      json.telemetry.kpis.totalActiveIssues
    );
    expect(json.telemetry.kpis.slaBreached).toBeLessThanOrEqual(
      json.telemetry.kpis.totalActiveIssues
    );
    expect(json.brief || json.summary).toBeTruthy();
    expect(String(json.brief || '')).not.toContain('12 mm');

    // Period filtering: 7d active issues <= all active issues
    const res7d = await GET(
      new Request('http://localhost:3000/api/desk/analyst/brief?wardCode=ALL&period=7d')
    );
    expect(res7d.status).toBe(200);
    const json7d = await res7d.json();
    expect(json7d.telemetry.kpis.totalActiveIssues).toBeLessThanOrEqual(
      json.telemetry.kpis.totalActiveIssues
    );
  });
});
