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

  // 2. Navigate to Repair Verification Page
  await page.goto('http://localhost:3000/citizen/audit');
  await page.waitForTimeout(1000);

  // Capture Available Tasks
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/audit_tasks.png' });
  console.log('Available tasks captured!');

  // 3. Switch to My Submissions tab
  await page.click('button:has-text("My Submissions")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/audit_submissions.png' });
  console.log('Submissions captured!');

  // 4. Switch back to Available Tasks and open Verification Modal
  await page.click('button:has-text("Available Tasks")');
  await page.waitForTimeout(400);
  await page.click('text=Pothole Repair');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/audit_modal.png' });
  console.log('Verification modal captured!');

  // 5. Mobile Viewport capture
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto('http://localhost:3000/citizen/audit');
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/audit_mobile.png' });
  console.log('Mobile audit captured!');

  await browser.close();
}

main().catch(console.error);
