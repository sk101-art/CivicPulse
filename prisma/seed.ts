import { PrismaClient, Role, Tier, Category, Status } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.APP_DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.pointLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.report.deleteMany();
  await prisma.citizenProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  const hashedPassword = await bcrypt.hash('demo123', 10);

  const pwd = await prisma.department.create({
    data: { name: 'Public Works Department', code: 'PWD', slaHours: 48 }
  });

  const trans = await prisma.department.create({
    data: { name: 'Transportation', code: 'TRANS', slaHours: 72 }
  });

  const citizen = await prisma.user.create({
    data: {
      name: 'Alpha Citizen',
      email: 'citizen@example.com',
      passwordHash: hashedPassword,
      role: Role.CITIZEN,
      citizenProfile: {
        create: {
          reputation: 250,
          tier: Tier.CONTRIBUTOR,
        }
      }
    },
    include: { citizenProfile: true }
  });

  const _authority = await prisma.user.create({
    data: {
      name: 'Chief Inspector',
      email: 'authority@civicpulse.gov',
      passwordHash: hashedPassword,
      role: Role.AUTHORITY,
      departmentId: pwd.id
    }
  });

  if (citizen.citizenProfile) {
    await prisma.report.create({
      data: {
        title: 'Massive Pothole Gridlock',
        description: 'Major infrastructure failure near the city center. Needs immediate patching.',
        category: Category.POTHOLES,
        latitude: 12.9716,
        longitude: 77.5946,
        address: 'Central Square, Block 5',
        citizenId: citizen.citizenProfile.id,
        departmentId: pwd.id,
        priorityScore: 0.85,
        status: Status.OPEN,
      }
    });

    await prisma.report.create({
      data: {
        title: 'Broken Streetlights',
        description: 'Sector 4 is completely dark. High security risk.',
        category: Category.STREETLIGHTS,
        latitude: 12.9800,
        longitude: 77.6000,
        address: 'Sector 4 Residential',
        citizenId: citizen.citizenProfile.id,
        departmentId: trans.id,
        priorityScore: 0.65,
        status: Status.OPEN,
      }
    });
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
