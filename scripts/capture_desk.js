const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');

  // Switch to Municipal Staff tab
  console.log('Switching to Municipal Staff role...');
  const staffBtn = page.getByRole('button', { name: /Municipal Staff/i });
  if (await staffBtn.isVisible()) {
    await staffBtn.click();
  }

  // Fill credentials
  console.log('Entering credentials...');
  await page.fill('input[type="email"]', 'desk-a@civicpulse.local');
  await page.fill('input[type="password"]', 'Password@1234');
  
  await page.click('button[type="submit"]');
  console.log('Submitted login, waiting for navigation...');
  await page.waitForURL(url => url.pathname.includes('/desk') || url.pathname.includes('/citizen'), { timeout: 15000 }).catch(e => console.log('Timeout waiting for URL:', page.url()));

  console.log('Current URL after login:', page.url());

  // 1. Operations Queue
  console.log('1. Capturing Operations Queue (/desk)...');
  await page.goto('http://localhost:3000/desk');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desk_queue.png') });
  console.log('Saved desk_queue.png');

  // 2. Issue Detail Drawer (Click first View button)
  console.log('2. Opening Issue Detail Drawer...');
  const viewButtons = page.locator('button:has-text("View")');
  if (await viewButtons.count() > 0) {
    await viewButtons.first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desk_drawer.png') });
    console.log('Saved desk_drawer.png');

    // Also close drawer
    const closeBtn = page.locator('[data-testid="close-drawer-button"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // 3. Area Briefing (/desk/briefing)
  console.log('3. Capturing Area Briefing (/desk/briefing)...');
  await page.goto('http://localhost:3000/desk/briefing');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desk_briefing.png') });
  console.log('Saved desk_briefing.png');

  // 4. Route Optimizer (/desk/map)
  console.log('4. Capturing Route Optimizer (/desk/map)...');
  await page.goto('http://localhost:3000/desk/map');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desk_route_optimizer.png') });
  console.log('Saved desk_route_optimizer.png');

  // 5. Claim Gap (/claim-gap)
  console.log('5. Capturing Claim Gap (/claim-gap)...');
  await page.goto('http://localhost:3000/claim-gap');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'claim_gap.png') });
  console.log('Saved claim_gap.png');

  // 6. Field Personnel (/desk/personnels)
  console.log('6. Capturing Field Personnel (/desk/personnels)...');
  await page.goto('http://localhost:3000/desk/personnels');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desk_personnels.png') });
  console.log('Saved desk_personnels.png');

  await browser.close();
  console.log('All captures complete!');
}

main().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
