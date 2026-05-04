import { config } from 'dotenv';
config();
import { prisma } from './src/lib/prisma';

async function main() {
  const users = await prisma.user.findMany({ include: { department: true } });
  console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
