import { resolveDbTarget, createPool, createPrisma, assertDbTarget } from "./lib/db-target";
async function main() {
  process.env.SEED_TARGET = "test";
  const target = resolveDbTarget();
  const pool = createPool(target); const prisma = createPrisma(pool, target);
  try {
    await assertDbTarget(pool, target);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "citizen@example.com" } });
    const issue = await prisma.issue.create({ data: {
      category: "POTHOLES", lat: 12.94, lng: 77.68,
      address: "Isolated test fixture: cross-browser refresh", isSeed: true,
      slaDueAt: new Date(Date.now() + 86400000),
      reports: { create: { userId: user.id, role: "REPORT", note: "Synthetic test fixture, not field evidence", lat: 12.94, lng: 77.68, gpsAccuracyM: 5, capturedAt: new Date(), photoUrl: "", photoSha256: "test-fixture", signature: "test-fixture", isSeed: true } },
    } });
    console.log(issue.id);
  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(() => { console.error("Fixture setup failed"); process.exitCode = 1; });
