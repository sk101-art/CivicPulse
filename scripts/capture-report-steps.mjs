import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Sign In
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(400);
  await page.fill('input[name=email]', 'ananya.das@civicpulse.org');
  await page.fill('input[name=password]', 'Password@1234');
  await page.click('button[type=submit]');
  await page.waitForTimeout(2000);

  // 2. Step 1: Category Selection
  await page.goto('http://localhost:3000/citizen/report');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/report_step1.png' });
  console.log('Step 1 captured!');

  // 3. Step 2: Evidence Capture
  await page.click('button:has-text("Next: Capture Evidence")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/report_step2.png' });
  console.log('Step 2 captured!');

  // 4. Step 3: Add Details
  await page.click('button:has-text("Next: Add Details")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/report_step3.png' });
  console.log('Step 3 captured!');

  // 5. Step 4: Review
  await page.click('button:has-text("Next")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/report_step4.png' });
  console.log('Step 4 captured!');

  await browser.close();
}

main().catch(console.error);
