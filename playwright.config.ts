import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

// Fail-fast test database isolation check
const rawProdUrl = process.env.PROD_DATABASE_URL || process.env.APP_DATABASE_URL;
const testDbUrl = process.env.DATABASE_URL_TEST;

if (!testDbUrl) {
  throw new Error(
    'DATABASE_URL_TEST must be configured in .env.local for running Playwright tests. Tests must never write to the production database.'
  );
}
if (rawProdUrl && testDbUrl === rawProdUrl) {
  throw new Error(
    'DATABASE_URL_TEST cannot equal production APP_DATABASE_URL! Tests must never write to the production database.'
  );
}

process.env.PROD_DATABASE_URL = rawProdUrl;
process.env.APP_DATABASE_URL = testDbUrl;
if (process.env.DIRECT_DATABASE_URL_TEST) {
  process.env.DIRECT_DATABASE_URL = process.env.DIRECT_DATABASE_URL_TEST;
}
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.PLAYWRIGHT_TEST = 'true';

const baseURL = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

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
    command: 'npm run build && npm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    env: {
      APP_DATABASE_URL: testDbUrl,
      DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL_TEST || testDbUrl,
      DATABASE_URL_TEST: testDbUrl,
      PROD_DATABASE_URL: rawProdUrl || '',
      NODE_ENV: 'test',
      PLAYWRIGHT_TEST: 'true',
    },
  },
});
