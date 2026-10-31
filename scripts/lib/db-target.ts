import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

/**
 * Database targeting for seed scripts and e2e specs that build their own Prisma client.
 *
 * Test runs (Vitest, Playwright, NODE_ENV=test, or SEED_TARGET=test) always use DATABASE_URL_TEST
 * against the isolated `test` schema. .env/.env.local never override variables the test runner
 * already set, and anything that would land in `public` fails fast.
 *
 * Note: `pg` ignores the `?schema=` URL parameter, so the schema is pinned explicitly via
 * search_path and the PrismaPg `schema` option — the URL alone is not enough.
 */

export type DbUrlVar = 'APP_DATABASE_URL' | 'DIRECT_DATABASE_URL' | 'DATABASE_URL';

export interface DbTarget {
  mode: 'test' | 'production';
  schema: 'test' | 'public';
  connectionString: string;
}

export function isTestRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'test' ||
    Boolean(env.VITEST) ||
    Boolean(env.PLAYWRIGHT_TEST) ||
    env.SEED_TARGET === 'test'
  );
}

function readEnvFile(file: string): Record<string, string> {
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}

/** Throws unless `url` explicitly targets schema=test and is not one of the production URLs. */
export function assertTestDatabaseUrl(url: string | undefined, prodUrls: (string | undefined)[]): string {
  if (!url) {
    throw new Error('DATABASE_URL_TEST must be set for test/e2e runs. Refusing to fall back to a production URL.');
  }
  let schema: string | null = null;
  try {
    schema = new URL(url).searchParams.get('schema');
  } catch {
    throw new Error('DATABASE_URL_TEST is not a valid connection URL.');
  }
  if (schema !== 'test') {
    throw new Error(
      `DATABASE_URL_TEST must target schema=test (got ${schema ? `schema=${schema}` : 'no schema, i.e. public'}). Refusing to run against the public schema.`
    );
  }
  if (prodUrls.some((p) => p && p === url)) {
    throw new Error('DATABASE_URL_TEST equals a production database URL. Refusing to run.');
  }
  return url;
}

/**
 * Resolves which database to use and loads .env/.env.local accordingly.
 * Test mode is decided before any env file is read, so a file can never switch a test run to production.
 */
export function resolveDbTarget(
  prefer: DbUrlVar[] = ['APP_DATABASE_URL', 'DIRECT_DATABASE_URL', 'DATABASE_URL'],
  env: NodeJS.ProcessEnv = process.env,
  rootDir: string = process.cwd()
): DbTarget {
  const testRun = isTestRun(env);
  const base = readEnvFile(path.join(rootDir, '.env'));
  const local = readEnvFile(path.join(rootDir, '.env.local'));

  if (testRun) {
    // Fill gaps only; never override what the test runner configured.
    for (const [k, v] of Object.entries({ ...base, ...local })) {
      if (env[k] === undefined) env[k] = v;
    }
    const prodUrls = [
      base.APP_DATABASE_URL,
      base.DIRECT_DATABASE_URL,
      local.APP_DATABASE_URL,
      local.DIRECT_DATABASE_URL,
      env.PROD_DATABASE_URL,
    ];
    const connectionString = assertTestDatabaseUrl(env.DATABASE_URL_TEST, prodUrls);
    // Anything downstream that reads APP_DATABASE_URL must also see the test database.
    env.APP_DATABASE_URL = connectionString;
    if (env.DIRECT_DATABASE_URL_TEST) env.DIRECT_DATABASE_URL = env.DIRECT_DATABASE_URL_TEST;
    return { mode: 'test', schema: 'test', connectionString };
  }

  // Production / local ops: historic behaviour — .env, then .env.local wins.
  for (const [k, v] of Object.entries(base)) {
    if (env[k] === undefined) env[k] = v;
  }
  Object.assign(env, local);
  const connectionString = prefer.map((k) => env[k]).find(Boolean);
  if (!connectionString) {
    throw new Error(`Database connection URL is required (${prefer.join(', ')}).`);
  }
  return { mode: 'production', schema: 'public', connectionString };
}

export function createPool(target: DbTarget): Pool {
  return new Pool({
    connectionString: target.connectionString,
    ...(target.schema === 'test' ? { options: '-c search_path=test,public' } : {}),
  });
}

export function createPrisma(pool: Pool, target: DbTarget): PrismaClient {
  const adapter = new PrismaPg(pool, target.schema === 'test' ? { schema: 'test' } : undefined);
  return new PrismaClient({ adapter });
}

/** Runtime check before writing: a test run must really be connected to the populated `test` schema. */
export async function assertDbTarget(pool: Pool, target: DbTarget): Promise<void> {
  if (target.schema !== 'test') return;
  const { rows } = await pool.query<{ schema: string; issue: string | null }>(
    `SELECT current_schema() AS schema, to_regclass('test."Issue"')::text AS issue`
  );
  if (rows[0]?.schema !== 'test' || !rows[0]?.issue) {
    throw new Error(
      `Test run would write to schema "${rows[0]?.schema ?? 'unknown'}" (test."Issue" ${rows[0]?.issue ? 'exists' : 'missing'}). Refusing to continue.`
    );
  }
}

/** Host + schema only, for logs (never the credentials). */
export function describeTarget(target: DbTarget): string {
  try {
    const u = new URL(target.connectionString);
    return `${target.mode} → ${u.hostname}:${u.port || '5432'} schema=${target.schema}`;
  } catch {
    return `${target.mode} schema=${target.schema}`;
  }
}

/** Convenience for e2e specs: a client bound to the resolved target. */
export function createSeedDb(prefer?: DbUrlVar[]) {
  const target = resolveDbTarget(prefer);
  const pool = createPool(target);
  const prisma = createPrisma(pool, target);
  return { target, pool, prisma, verify: () => assertDbTarget(pool, target) };
}
