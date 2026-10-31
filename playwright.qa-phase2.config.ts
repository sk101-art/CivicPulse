/**
 * Playwright config for QA Phase 2 desk exploration.
 *
 * Setup project:
 *  - Seeds test DB once (always resets passwordHash to SEED_DESK_PASSWORD)
 *  - Logs in desk-a, desk-b, citizen and saves .playwright-auth/<role>.json
 *  - If any login fails, aborts the whole run immediately (no worker-restart loop)
 *
 * All desk tests depend on the setup project and load desk-a storage state.
 */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { assertTestDatabaseUrl } from './scripts/lib/db-target';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const rawProdUrl = process.env.PROD_DATABASE_URL || process.env.APP_DATABASE_URL;
const testDbUrl = assertTestDatabaseUrl(process.env.DATABASE_URL_TEST, [rawProdUrl, process.env.DIRECT_DATABASE_URL]);

process.env.PROD_DATABASE_URL = rawProdUrl;
process.env.APP_DATABASE_URL = testDbUrl;
if (process.env.DIRECT_DATABASE_URL_TEST) {
  process.env.DIRECT_DATABASE_URL = process.env.DIRECT_DATABASE_URL_TEST;
}
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.PLAYWRIGHT_TEST = 'true';

const E2E_PORT = Number(process.env.E2E_PORT || 3100);
const baseURL = `http://localhost:${E2E_PORT}`;
const AUTH_DIR = path.resolve(process.cwd(), '.playwright-auth');

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/qa-phase2-desk.spec.ts',
  globalSetup: './tests/e2e/qa-phase2-setup.ts',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on',
    video: 'on',
    storageState: path.join(AUTH_DIR, 'desk-a.json'),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npx next start -p ${E2E_PORT}`,
    port: E2E_PORT,
    reuseExistingServer: false,
    timeout: 60000,
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
