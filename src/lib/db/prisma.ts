import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '@/lib/env';

const globalForPrisma = globalThis as unknown as {
  newPrisma: PrismaClient | undefined;
  newPool: Pool | undefined;
};

const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  Boolean(process.env.VITEST) ||
  Boolean(process.env.PLAYWRIGHT_TEST);

if (isTestEnv) {
  const testUrl = process.env.DATABASE_URL_TEST;
  const prodUrl = process.env.PROD_DATABASE_URL || process.env.APP_DATABASE_URL;
  if (!testUrl) {
    throw new Error('DATABASE_URL_TEST must be defined in test environment');
  }
  if (!testUrl.includes('schema=test')) {
    throw new Error('DATABASE_URL_TEST must explicitly target schema=test');
  }
  if (prodUrl && testUrl === prodUrl) {
    throw new Error(
      'DATABASE_URL_TEST cannot equal production APP_DATABASE_URL! Tests must never write to production database.'
    );
  }
}

function resolveConnectionString(rawUrl?: string): string {
  if (!rawUrl) {
    throw new Error("Database URL is missing in environment");
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

const rawTargetUrl = isTestEnv
  ? (process.env.DATABASE_URL_TEST || env.APP_DATABASE_URL)
  : env.APP_DATABASE_URL;

const connectionString = resolveConnectionString(rawTargetUrl);

function getOrCreatePool(): Pool {
  if (globalForPrisma.newPool) {
    return globalForPrisma.newPool;
  }

  const pool = new Pool({
    connectionString,
    ...(isTestEnv ? { options: '-c search_path=test,public' } : {}),
    max: isTestEnv ? 10 : 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    // Prevent unhandled error events on idle clients when PgBouncer drops connections
    console.warn('PostgreSQL pool idle client notice:', err.message);
  });

  // Cache on globalThis in production too so warm serverless instances reuse it
  globalForPrisma.newPool = pool;

  return pool;
}

const pool = getOrCreatePool();
const adapter = new PrismaPg(
  pool,
  isTestEnv ? { schema: 'test' } : undefined
);

export const prisma =
  globalForPrisma.newPrisma ??
  new PrismaClient({ adapter });

// Cache on globalThis in production too so warm serverless instances reuse it
globalForPrisma.newPrisma = prisma;
