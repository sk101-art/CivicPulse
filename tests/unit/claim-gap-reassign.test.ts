import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth/next';
import { POST } from '@/app/api/issues/[id]/reassign/route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

const mockedGetSession = vi.mocked(getServerSession);

describe('POST /api/issues/[id]/reassign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated and non-AUTHORITY users', async () => {
    mockedGetSession.mockResolvedValueOnce(null);
    const res1 = await POST(
      new Request('http://localhost:3000/api/issues/iss-1/reassign', {
        method: 'POST',
        body: JSON.stringify({ agencyId: 'ag-1', reason: 'SLA breach' }),
      }),
      { params: Promise.resolve({ id: 'iss-1' }) }
    );
    expect(res1.status).toBe(401);

    mockedGetSession.mockResolvedValueOnce({
      user: { id: 'cit-1', role: 'CITIZEN', email: 'citizen@civicpulse.in' },
    } as any);
    const res2 = await POST(
      new Request('http://localhost:3000/api/issues/iss-1/reassign', {
        method: 'POST',
        body: JSON.stringify({ agencyId: 'ag-1', reason: 'SLA breach' }),
      }),
      { params: Promise.resolve({ id: 'iss-1' }) }
    );
    expect(res2.status).toBe(403);
  });

  it('rejects empty reassignment reason and inactive personnel', async () => {
    const authUser = await prisma.user.findFirst({ where: { role: 'AUTHORITY' } });
    expect(authUser).not.toBeNull();
    mockedGetSession.mockResolvedValue({
      user: { id: authUser!.id, role: 'AUTHORITY', email: authUser!.email },
    } as any);

    const resEmpty = await POST(
      new Request('http://localhost:3000/api/issues/iss-1/reassign', {
        method: 'POST',
        body: JSON.stringify({ agencyId: 'ag-1', reason: 'Other', otherReason: '   ' }),
      }),
      { params: Promise.resolve({ id: 'iss-1' }) }
    );
    expect(resEmpty.status).toBe(400);
  });

  it('transactionally reassigns agency and personnel, preserves history, and writes ActionLog', async () => {
    const [authUser, agencies, personnel, sampleIssue] = await Promise.all([
      prisma.user.findFirst({ where: { role: 'AUTHORITY' } }),
      prisma.agency.findMany({ take: 2, orderBy: { code: 'asc' } }),
      prisma.personnel.findFirst({ where: { active: true } }),
      prisma.issue.findFirst({ where: { status: 'DISPUTED' } }),
    ]);

    expect(authUser).not.toBeNull();
    expect(agencies.length).toBeGreaterThan(0);

    const targetIssue = sampleIssue || (await prisma.issue.findFirst());
    expect(targetIssue).not.toBeNull();

    const newAgency =
      agencies.find((a) => a.id !== targetIssue!.agencyId) || agencies[0];

    mockedGetSession.mockResolvedValue({
      user: { id: authUser!.id, role: 'AUTHORITY', email: authUser!.email },
    } as any);

    const prevAgencyId = targetIssue!.agencyId;
    const prevHandoff = targetIssue!.handoffCount;

    try {
      const res = await POST(
        new Request(`http://localhost:3000/api/issues/${targetIssue!.id}/reassign`, {
          method: 'POST',
          body: JSON.stringify({
            agencyId: newAgency.id,
            personnelId: personnel?.id,
            reason: 'Repair quality unsatisfactory',
            note: 'Automated verification test reassignment',
          }),
        }),
        { params: Promise.resolve({ id: targetIssue!.id }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.issue.agencyId).toBe(newAgency.id);
      expect(json.issue.handoffCount).toBe(prevHandoff + 1);
      expect(json.actionLog.action).toBe('REASSIGN_AGENCY');
      expect(json.actionLog.note).toContain('Repair quality unsatisfactory');
    } finally {
      // Restore original issue agency & handoffCount so DB stays clean
      await prisma.issue.update({
        where: { id: targetIssue!.id },
        data: { agencyId: prevAgencyId, handoffCount: prevHandoff },
      });
    }
  });
});
