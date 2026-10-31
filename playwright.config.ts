import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { assertTestDatabaseUrl } from './scripts/lib/db-target';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

// Fail-fast test database isolation check
const rawProdUrl = process.env.PROD_DATABASE_URL || process.env.APP_DATABASE_URL;
// Requires schema=test and refuses any production URL.
const testDbUrl = assertTestDatabaseUrl(process.env.DATABASE_URL_TEST, [rawProdUrl, process.env.DIRECT_DATABASE_URL]);

process.env.PROD_DATABASE_URL = rawProdUrl;
process.env.APP_DATABASE_URL = testDbUrl;
if (process.env.DIRECT_DATABASE_URL_TEST) {
  process.env.DIRECT_DATABASE_URL = process.env.DIRECT_DATABASE_URL_TEST;
}
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.PLAYWRIGHT_TEST = 'true';

// E2E always talks to its own server on a dedicated port, never APP_URL (the deployed production app)
// or a dev server on :3000 that may be running against the production database.
const E2E_PORT = Number(process.env.E2E_PORT || 3100);
const baseURL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Plain next build: `npm run build` would run `prisma migrate deploy`, whose config reads .env.local (production).
    command: `npx next build --webpack && npx next start -p ${E2E_PORT}`,
    port: E2E_PORT,
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      APP_DATABASE_URL: testDbUrl,
      DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL_TEST || testDbUrl,
      DATABASE_URL_TEST: testDbUrl,
      PROD_DATABASE_URL: rawProdUrl || '',
      NODE_ENV: 'test',
      PLAYWRIGHT_TEST: 'true',
      NEXTAUTH_URL: baseURL,
      APP_URL: baseURL,
    },
  },
});
