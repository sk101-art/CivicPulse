import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 1. Sign In
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(400);
  await page.fill('input[name=email]', 'ananya.das@civicpulse.org');
  await page.fill('input[name=password]', 'Password@1234');
  await page.click('button[type=submit]');
  await page.waitForTimeout(2000);

  // 2. Navigate to Citizen Map View
  await page.goto('http://localhost:3000/citizen/map');
  await page.waitForTimeout(3000); // Allow CartoDB tiles and pins to render

  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/map_view.png' });
  console.log('Map view captured!');

  // 3. Click the first issue card to select and fly to it
  const firstIssue = page.locator('text=Pothole on MG Road').first();
  if (await firstIssue.isVisible()) {
    await firstIssue.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/map_view_selected.png' });
    console.log('Map view selected captured!');
  }

  // 4. Mobile Viewport capture
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto('http://localhost:3000/citizen/map');
  await mobilePage.waitForTimeout(2500);
  await mobilePage.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/map_view_mobile.png' });
  console.log('Map view mobile captured!');

  await browser.close();
}

main().catch(console.error);
