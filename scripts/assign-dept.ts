import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = "postgresql://postgres.rjmnhiqdpvevtlewxqgv:nDZJFtj3SdgChKwv@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connect_timeout=30";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

async function main() {
  // Revert citizen@example.com back to CITIZEN role with no department
  const restored = await p.user.update({
    where: { id: 'cmpy8fvub000264fpgvjbhw6v' },
    data: {
      role: 'CITIZEN',
      departmentId: null,
    },
    select: { id: true, email: true, role: true, departmentId: true }
  });
  console.log('RESTORED:', JSON.stringify(restored, null, 2));
  console.log(`✅ ${restored.email} → role=${restored.role}, departmentId=${restored.departmentId}`);

  // Confirm authority account is still correct
  const authority = await p.user.findUnique({
    where: { email: 'authority@civicpulse.gov' },
    select: { id: true, email: true, role: true, departmentId: true }
  });
  console.log('AUTHORITY ACCOUNT:', JSON.stringify(authority, null, 2));
}

main()
  .then(() => pool.end())
  .catch(e => { console.error('Error:', e.message); pool.end(); process.exit(1); });
