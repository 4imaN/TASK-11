/**
 * Shared helpers for Playwright E2E tests.
 */

/**
 * Login as a given user via the login form.
 */
export async function login(page, username, password = 'password123') {
  await page.goto('/');
  // Wait for login form
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  // Wait for redirect / sidebar to appear
  await page.waitForSelector('.sidebar', { timeout: 10000 });
}

/**
 * Logout the current user.
 */
export async function logout(page) {
  await page.click('button:has-text("Logout")');
  // The app uses window.location.href = '/' which triggers a full reload
  await page.waitForURL('**/');
  await page.waitForTimeout(1000);
  // Wait for login form to appear after reload
  await page.waitForSelector('#username', { timeout: 15000 });
}

/**
 * Generate a unique string for idempotency keys, etc.
 */
export function uniqueId(prefix = 'test') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
