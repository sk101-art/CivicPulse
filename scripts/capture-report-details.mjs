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

  // 2. Navigate to Report Details Page (CP-2025-0184)
  await page.goto('http://localhost:3000/citizen/report/CP-2025-0184');
  await page.waitForTimeout(1000);

  // Capture Overview
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/report_details_overview.png' });
  console.log('Report details overview captured!');

  // 3. Switch to Timeline tab
  await page.click('button:has-text("Timeline")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/report_details_timeline.png' });
  console.log('Report details timeline captured!');

  // 4. Switch to Evidence tab
  await page.click('button:has-text("Evidence")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/report_details_evidence.png' });
  console.log('Report details evidence captured!');

  // 5. Switch to Verifications tab
  await page.click('button:has-text("Verifications")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/report_details_verifications.png' });
  console.log('Report details verifications captured!');

  // 6. Mobile Viewport capture
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto('http://localhost:3000/citizen/report/CP-2025-0184');
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/report_details_mobile.png' });
  console.log('Report details mobile captured!');

  await browser.close();
}

main().catch(console.error);
