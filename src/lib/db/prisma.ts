import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '@/lib/env';

const globalForPrisma = globalThis as unknown as {
  newPrisma: PrismaClient | undefined;
  newPool: Pool | undefined;
};

function resolveConnectionString(rawUrl?: string): string {
  if (!rawUrl) {
    throw new Error("APP_DATABASE_URL is missing in environment");
  }
  let url = rawUrl;
  if (url.includes(':6543') && !url.includes('pgbouncer=true')) {
    url += url.includes('?') ? '&pgbouncer=true' : '?pgbouncer=true';
  }
  if (!url.includes('connect_timeout=')) {
    url += url.includes('?') ? '&connect_timeout=30' : '?connect_timeout=30';
  }
  return url;
}

const connectionString = resolveConnectionString(env.APP_DATABASE_URL);

function getOrCreatePool(): Pool {
  if (globalForPrisma.newPool) {
    return globalForPrisma.newPool;
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    // Prevent unhandled error events on idle clients when PgBouncer drops connections
    console.warn('PostgreSQL pool idle client notice:', err.message);
  });

  if (env.NODE_ENV !== 'production') {
    globalForPrisma.newPool = pool;
  }

  return pool;
}

const pool = getOrCreatePool();
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.newPrisma ??
  new PrismaClient({ adapter });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.newPrisma = prisma;
}
