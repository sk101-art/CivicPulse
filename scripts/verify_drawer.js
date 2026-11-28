const { chromium } = require('@playwright/test');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Login
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  const staffBtn = page.getByRole('button', { name: /Municipal Staff/i });
  if (await staffBtn.isVisible()) await staffBtn.click();
  await page.fill('input[type="email"]', 'desk-a@civicpulse.local');
  await page.fill('input[type="password"]', 'Password@1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => url.pathname.includes('/desk'), { timeout: 15000 });

  // On /desk
  console.log('On /desk');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Click on the first table row or view button
  const row = page.locator('tbody tr').first();
  console.log('Row visible:', await row.isVisible());
  await row.click();

  // Wait for drawer
  const drawer = page.locator('[data-testid="issue-drawer"]');
  await drawer.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Drawer is visible!');

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desk_drawer_verified.png') });
  console.log('Saved desk_drawer_verified.png');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
