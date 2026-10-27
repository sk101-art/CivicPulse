import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '@/lib/env';

const globalForPrisma = globalThis as unknown as {
  newPrisma: PrismaClient | undefined;
};

const connectionString = env.APP_DATABASE_URL;

if (!connectionString) {
  throw new Error("APP_DATABASE_URL is missing in environment");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.newPrisma ??
  new PrismaClient({ adapter });

if (env.NODE_ENV !== 'production') globalForPrisma.newPrisma = prisma;

// Refreshed for Personnel model integration
// Triggering client reload after status enum update
