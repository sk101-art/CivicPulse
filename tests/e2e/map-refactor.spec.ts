import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

test.describe('T40 Map Refactor Acceptance: Citizen and Desk Maps', () => {
  test.beforeAll(() => {
    const screenshotDir = path.resolve(process.cwd(), 'tests', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('renders Citizen Map (/citizen/map) with Leaflet container and controls', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Log in as citizen
    await page.goto('/login');
    await page.fill('input[type="email"]', 'citizen@example.com');
    await page.fill('input[type="password"]', seedPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => url.pathname.includes('/citizen/dashboard'), { timeout: 15000 });

    // Navigate to /citizen/map
    await page.goto('/citizen/map');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await page.waitForTimeout(2000); // allow map tiles and markers to settle

    // Assert Leaflet map is mounted and visible
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();

    // Assert header elements
    await expect(page.locator('h1')).toContainText('Issues Near Me');

    // Take after screenshot
    const screenshotPath = path.resolve(process.cwd(), 'tests', 'screenshots', 'citizen-map-after.png');
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);

    await context.close();
  });

  test('renders Desk Map (/desk/map) with Leaflet container and routing grid', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Log in as desk operator
    await page.goto('/login');
    await page.fill('input[type="email"]', 'desk-a@civicpulse.local');
    await page.fill('input[type="password"]', seedPassword);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => url.pathname.includes('/desk'), { timeout: 15000 });

    // Navigate to /desk/map
    await page.goto('/desk/map');
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    await page.waitForTimeout(2000); // allow map tiles to settle

    // Assert Leaflet map is mounted and visible
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();

    // Assert header elements
    await expect(page.locator('header')).toContainText('Route Optimizer');

    // Take after screenshot
    const screenshotPath = path.resolve(process.cwd(), 'tests', 'screenshots', 'desk-map-after.png');
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);

    await context.close();
  });

  test('line counts of both wrapper components are below 150 lines', () => {
    const authorityMapPath = path.resolve(process.cwd(), 'src', 'components', 'authority', 'AuthorityMap.tsx');
    const citizenMapPath = path.resolve(process.cwd(), 'src', 'components', 'citizen', 'IssuesNearMeMap.tsx');

    const authorityLines = fs.readFileSync(authorityMapPath, 'utf-8').split('\n').length;
    const citizenLines = fs.readFileSync(citizenMapPath, 'utf-8').split('\n').length;

    expect(authorityLines).toBeLessThan(150);
    expect(citizenLines).toBeLessThan(150);
  });
});
