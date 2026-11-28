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

  // 2. Navigate to Profile Page
  await page.goto('http://localhost:3000/citizen/profile');
  await page.waitForTimeout(1000);

  // Capture Overview
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/profile_overview.png' });
  console.log('Profile overview captured!');

  // 3. Switch to Verification History tab
  await page.click('button:has-text("Verification History")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/profile_verifications.png' });
  console.log('Profile verifications captured!');

  // 4. Switch to Leaderboard tab
  await page.click('button:has-text("Leaderboard")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/profile_leaderboard.png' });
  console.log('Profile leaderboard captured!');

  // 5. Open Edit Profile Modal
  await page.click('button:has-text("Edit Profile")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/profile_edit_modal.png' });
  console.log('Edit profile modal captured!');

  // 6. Mobile Viewport capture
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto('http://localhost:3000/citizen/profile');
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: 'C:/Users/Asus/.gemini/antigravity/brain/ab722af4-4d68-40d8-a4ca-e4bd6e582a2f/profile_mobile.png' });
  console.log('Profile mobile captured!');

  await browser.close();
}

main().catch(console.error);
