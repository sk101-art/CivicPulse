import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const found = await prisma.report.findMany({
    where: { title: { contains: 'niggo', mode: 'insensitive' } },
    select: { id: true, title: true, status: true }
  });

  console.log('Found reports:', JSON.stringify(found, null, 2));

  for (const r of found) {
    await prisma.vote.deleteMany({ where: { reportId: r.id } });
    await prisma.comment.deleteMany({ where: { reportId: r.id } });
    await prisma.pointLog.deleteMany({ where: { reportId: r.id } });
    // delete assignment if it exists
    try { await prisma.assignment.deleteMany({ where: { reportId: r.id } }); } catch {}
    await prisma.report.delete({ where: { id: r.id } });
    console.log('✓ Deleted:', r.title, '(', r.id, ')');
  }

  if (found.length === 0) console.log('No report named "niggo" found.');
}

main()
  .then(() => { pool.end(); process.exit(0); })
  .catch(e => { console.error('Error:', e.message); pool.end(); process.exit(1); });
