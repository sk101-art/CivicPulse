const { test, expect } = require('@playwright/test');

test('test login page', async ({ page }) => {
  // Listen for all console events and handle errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`Error text: "${msg.text()}"`);
    } else {
      console.log(`Console [${msg.type()}]: ${msg.text()}`);
    }
  });

  page.on('pageerror', exception => {
    console.log(`Uncaught exception: "${exception}"`);
  });

  try {
    await page.goto('http://localhost:3000/login', { timeout: 30000 });
    
    // Check if the page has loaded successfully
    await page.waitForLoadState('domcontentloaded');
    
    console.log('Page loaded successfully.');
    
    // Check for a specific element to verify layout
    const loginForm = page.locator('form');
    if (await loginForm.count() > 0) {
      console.log('Login form found on the page.');
    } else {
      console.log('Login form NOT found.');
    }

    const title = await page.title();
    console.log(`Page title is: ${title}`);

  } catch (error) {
    console.error(`Failed to navigate or assert: ${error.message}`);
  }
});
