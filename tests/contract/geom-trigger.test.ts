import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';

describe('T10 PostGIS Trigger Acceptance Test', () => {
  let createdIssueId: string | null = null;

  afterAll(async () => {
    if (createdIssueId) {
      try {
        await prisma.issue.delete({ where: { id: createdIssueId } });
      } catch {
        // ignore cleanup error
      }
    }
  });

  it('inserts an Issue via Prisma and reads back a non-null geom filled by trigger', async () => {
    // Bengaluru coordinates
    const lat = 12.9716;
    const lng = 77.5946;

    const issue = await prisma.issue.create({
      data: {
        category: 'POTHOLES',
        status: 'OPEN',
        lat,
        lng,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });

    createdIssueId = issue.id;
    expect(issue.id).toBeDefined();

    // Query raw geom with ST_AsText
    const rows = await prisma.$queryRaw<Array<{ geom_text: string }>>`
      SELECT ST_AsText(geom) as geom_text FROM "Issue" WHERE id = ${issue.id}
    `;

    expect(rows.length).toBe(1);
    expect(rows[0].geom_text).toBe(`POINT(${lng} ${lat})`);
  });
});
