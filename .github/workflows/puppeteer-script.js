// .github/workflows/puppeteer-script.js
module.exports = async (browser, context) => {
  const page = await browser.newPage();
  const targetUrl = context.url; // URL Lighthouse will audit

  // Navigate to the login page - adjust if your login page URL is different
  // Assuming the app redirects to /login if not authenticated,
  // or we can navigate directly if we know the login page URL.
  // For this example, let's assume the PWA starts at root and might redirect or have a login link.
  await page.goto(targetUrl, { waitUntil: 'networkidle0' });

  // Check if already on the target page and logged in (e.g., by looking for a logout button or specific content)
  // This is a placeholder, adjust the selector based on your app's logged-in state indication
  const isLoggedIn = await page.evaluate(() => !!document.querySelector('button[aria-label="Logout"]'));

  if (isLoggedIn) {
    console.log('Already logged in or no login required for target URL.');
    await page.close();
    return;
  }

  // Attempt to find and click a login link/button if not directly on a login form
  // This is highly dependent on your app's structure.
  // Example: if there's a "Login" button/link on the homepage
  const loginButton = await page.$('a[href="/login"], button#login-button'); // Adjust selector
  if (loginButton && !targetUrl.includes('/login')) { // Avoid clicking if already on login page
    console.log('Found login button/link, clicking...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      loginButton.click(),
    ]);
  } else if (!targetUrl.includes('/login')) {
    // If no obvious login button and not on a login page, try navigating directly
    const loginPageUrl = new URL('/login', targetUrl).toString();
    console.log(`Navigating to login page: ${loginPageUrl}`);
    await page.goto(loginPageUrl, { waitUntil: 'networkidle0' });
  }


  // Perform login
  // Use environment variables for credentials for security in GitHub Actions
  const username = process.env.PWA_USERNAME || 'testuser'; // Default for local testing
  const password = process.env.PWA_PASSWORD || 'testpassword'; // Default for local testing

  console.log(`Attempting to log in as ${username}...`);

  // Replace with selectors for your username and password fields and submit button
  await page.type('input[name="username"]', username); // Adjust selector
  await page.type('input[name="password"]', password); // Adjust selector

  // Click the login button and wait for navigation or content change
  await Promise.all([
    // page.waitForNavigation({ waitUntil: 'networkidle0' }), // If login causes a full navigation
    page.waitForResponse(response => response.url().includes('/api/login') && response.status() === 200, { timeout: 10000 }),
    page.click('button[type="submit"]'), // Adjust selector for your login button
  ]);

  console.log('Login form submitted.');

  // Wait for a moment to ensure client-side redirects or content loading after login
  await page.waitForTimeout(5000);


  // After login, navigate to the original target URL if not already there
  if (page.url() !== targetUrl) {
    console.log(`Navigating back to target URL: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });
  }

  console.log(`Currently at ${page.url()}, ready for Lighthouse audit.`);
  // The page is now logged in and at the target URL. Lighthouse will take over.
  // No need to close the page here; Lighthouse controls the page lifecycle.
};
