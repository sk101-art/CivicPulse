import { test, expect } from '@playwright/test';

// replaced by T73
test.describe.skip('legacy sync test', () => {
  test('Cross-module sync between Citizen and Authority', async ({ page }) => {
    // Use a unique ID for this test run
    const uniqueId = Date.now();
    const citizenEmail = `testcitizen_${uniqueId}@example.com`;
    const authorityEmail = `testauthority_${uniqueId}@example.com`;
    const reportTitle = `Pothole DOM Test ${uniqueId}`;
    
    // 1. Register a new Citizen account
    await page.goto('http://localhost:3000/login');
    
    let response = await page.goto('http://localhost:3000/register');
    if (response?.status() === 404) {
      await page.goto('http://localhost:3000/login');
      await page.click('text=CREATE ACCOUNT');
    }

    // Fill registration form for Citizen
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', citizenEmail);
    await page.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'password123');
    const nameInputs = await page.$$('input[name="name"], input[placeholder*="name" i]');
    if (nameInputs.length > 0) {
      await nameInputs[0].fill('Citizen Tester');
    }
    
    // Submit registration
    await page.click('button:has-text("INITIATE REGISTRATION")');
    await page.waitForURL('**/citizen/dashboard', { timeout: 10000 }).catch(() => {});

    // 2. Go to /citizen/report and file a report
    await page.goto('http://localhost:3000/citizen/report');
    
    const catButtons = await page.$$('button:has(span:text-is("POTHOLES"))');
    if (catButtons.length > 0) await catButtons[0].click();
    else await page.click('button:has-text("POTHOLES")').catch(()=>page.click('text=POTHOLES'));

    // STEP 2: DETAILS
    await page.waitForSelector('input[placeholder*="title" i]', { timeout: 5000 });
    await page.fill('input[placeholder*="title" i]', reportTitle);
    await page.fill('textarea[placeholder*="Describe" i]', 'Testing cross-module sync from Playwright test');
    await page.click('button:has-text("Continue to Location")');

    // STEP 3: LOCATION
    await page.waitForSelector('input[placeholder*="address" i]', { timeout: 5000 });
    await page.fill('input[placeholder*="address" i]', '123 Playwright St');
    await page.click('button:has-text("Review & Transmit")');

    // STEP 4: SUBMIT
    await page.waitForSelector('button:has-text("FINALIZE & TRANSMIT")', { timeout: 5000 });
    await page.click('button:has-text("FINALIZE & TRANSMIT")');
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/citizen/dashboard', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 3. Logout
    await page.context().clearCookies();
    await page.goto('http://localhost:3000/login');

    // 4. Register as Authority account
    await page.goto('http://localhost:3000/login');
    await page.click('text=AUTHORITY');
    await page.click('text=CREATE ACCOUNT');
    
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', authorityEmail);
    await page.fill('input[type="password"], input[name="password"], input[placeholder*="password" i]', 'password123');
    const authNameInputs = await page.$$('input[placeholder="NAME / SURNAME"]');
    if (authNameInputs.length > 0) {
      await authNameInputs[0].fill('Authority Tester');
    }
    
    await page.click('button:has-text("INITIATE REGISTRATION")');
    await page.waitForURL('**/authority/dashboard', { timeout: 10000 }).catch(() => {});

    // 5. Go to authority dashboard
    await page.goto('http://localhost:3000/authority/dashboard');
    
    // 6. Look for the report
    const content = await page.content();
    const isFoundInDashboard = content.includes(reportTitle);
    
    await page.goto('http://localhost:3000/authority/map');
    const mapContent = await page.content();
    const isFoundInMap = mapContent.includes(reportTitle);

    // Assertions
    expect(isFoundInDashboard).toBeTruthy();
    expect(isFoundInMap).toBeTruthy();
  });
});
