import { defineConfig } from 'vitest/config';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

const rootDir = __dirname;
if (fs.existsSync(path.join(rootDir, '.env'))) {
  dotenv.config({ path: path.join(rootDir, '.env') });
}
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
  dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });
}

// Fail-fast test database isolation check
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.VITEST = 'true';

const rawProdUrl = process.env.PROD_DATABASE_URL || process.env.APP_DATABASE_URL;
const testDbUrl = process.env.DATABASE_URL_TEST;

if (!testDbUrl) {
  throw new Error(
    'DATABASE_URL_TEST must be configured in .env.local for running tests. Tests must never write to the production database.'
  );
}
if (rawProdUrl && testDbUrl === rawProdUrl) {
  throw new Error(
    'DATABASE_URL_TEST cannot equal production APP_DATABASE_URL! Tests must never write to the production database.'
  );
}

// Store production URL in PROD_DATABASE_URL and point APP_DATABASE_URL to DATABASE_URL_TEST
process.env.PROD_DATABASE_URL = rawProdUrl;
process.env.APP_DATABASE_URL = testDbUrl;
if (process.env.DIRECT_DATABASE_URL_TEST) {
  process.env.DIRECT_DATABASE_URL = process.env.DIRECT_DATABASE_URL_TEST;
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/contract/**/*.test.{ts,tsx}'],
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
});
