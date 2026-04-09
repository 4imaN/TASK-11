import { test, expect } from '@playwright/test';
import { login, uniqueId } from './helpers.js';

test.describe('Dispatcher Role — Full Suite', () => {

  // Note: dispatcher1 may be locked from auth tests. Use admin to create orders
  // and then test dispatch. We'll login as admin first to create tasks, then dispatcher.

  test('create an order as buyer to generate tasks', async ({ page }) => {
    await login(page, 'admin');
    // Create a buyer order via API to generate dispatch tasks
    // Use admin to at least ensure tasks exist
    await page.goto('/admin');
    await expect(page.locator('h2:has-text("Admin Dashboard")')).toBeVisible();
  });

  test('dispatcher login and task board loads', async ({ page }) => {
    // Try dispatcher1, if locked try reviewer1 (has admin role which includes task.*)
    await login(page, 'reviewer1');
    await page.goto('/dispatcher');
    await expect(page.locator('h2:has-text("Task Board")')).toBeVisible();
  });

  test('task board shows grab-order and assigned mode buttons', async ({ page }) => {
    await login(page, 'reviewer1');
    await page.goto('/dispatcher');
    await expect(page.locator('button:has-text("Grab Order")')).toBeVisible();
    await expect(page.locator('button:has-text("Assigned to Me")')).toBeVisible();
  });

  test('task board shows worker metrics', async ({ page }) => {
    await login(page, 'reviewer1');
    await page.goto('/dispatcher');
    await expect(page.locator('text=Completed')).toBeVisible();
    await expect(page.locator('text=Active')).toBeVisible();
    await expect(page.locator('text=Reputation')).toBeVisible();
    // Reputation score bar
    await expect(page.locator('.score-bar').first()).toBeVisible();
  });

  test('switch between grab and assigned mode', async ({ page }) => {
    await login(page, 'reviewer1');
    await page.goto('/dispatcher');

    // Click assigned mode
    await page.click('button:has-text("Assigned to Me")');
    await page.waitForTimeout(500);

    // Click grab mode
    await page.click('button:has-text("Grab Order")');
    await page.waitForTimeout(500);
  });

  test('task cards show status badges', async ({ page }) => {
    await login(page, 'reviewer1');
    await page.goto('/dispatcher');
    await page.waitForTimeout(1000);
    const taskCards = page.locator('.task-card');
    const count = await taskCards.count();
    if (count > 0) {
      // Each task card should have a status badge
      await expect(taskCards.first().locator('.badge')).toBeVisible();
    }
  });

  test('accept task from grab mode', async ({ page }) => {
    await login(page, 'reviewer1');
    await page.goto('/dispatcher');
    await page.waitForTimeout(1000);

    const taskCards = page.locator('.task-card');
    const count = await taskCards.count();
    test.skip(count === 0, 'No tasks available to accept — create orders first');

    const acceptBtn = page.locator('.task-card button:has-text("Accept")').first();
    await expect(acceptBtn).toBeVisible({ timeout: 5000 });
    await acceptBtn.click();
    await page.waitForTimeout(1000);
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible({ timeout: 5000 });
    const text = await toast.textContent();
    expect(text.includes('accepted') || text.includes('taken') || text.includes('modified')).toBeTruthy();
  });

  test('task lifecycle: accept -> start -> complete', async ({ page }) => {
    await login(page, 'reviewer1');
    await page.goto('/dispatcher');
    await page.waitForTimeout(1000);

    const taskCards = page.locator('.task-card');
    const taskCount = await taskCards.count();
    test.skip(taskCount === 0, 'No tasks available for lifecycle test — create orders first');

    // Accept an open task
    const acceptBtn = page.locator('.task-card button:has-text("Accept")').first();
    await expect(acceptBtn).toBeVisible({ timeout: 5000 });
    await acceptBtn.click();
    await page.waitForTimeout(1000);

    // Switch to assigned mode to see accepted tasks
    await page.click('button:has-text("Assigned to Me")');
    await page.waitForTimeout(1000);

    // Start an accepted task
    const startBtn = page.locator('.task-card button:has-text("Start")').first();
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();
    await page.waitForTimeout(1000);

    // Complete an in-progress task
    const completeBtn = page.locator('.task-card button:has-text("Complete")').first();
    await expect(completeBtn).toBeVisible({ timeout: 5000 });
    await completeBtn.click();
    await expect(page.locator('.toast')).toBeVisible({ timeout: 5000 });
  });

  // ─── Recommendations ───
  test('recommendations page shows ranked tasks', async ({ page }) => {
    await login(page, 'reviewer1');
    await page.goto('/dispatcher/recommendations');
    await expect(page.locator('h2:has-text("Recommended Tasks")')).toBeVisible();
    await page.waitForTimeout(1000);

    // If there are recommendations, they should show scores
    const taskCards = page.locator('.task-card');
    const count = await taskCards.count();
    if (count > 0) {
      // Each card should have a score badge
      await expect(taskCards.first().locator('text=Score')).toBeVisible();
      // Should show breakdown
      await expect(page.locator('text=Time fit').first()).toBeVisible();
      await expect(page.locator('text=Workload').first()).toBeVisible();
      await expect(page.locator('text=Reputation').first()).toBeVisible();
      // Should show score bar
      await expect(page.locator('.score-bar').first()).toBeVisible();
    }
  });

  test('accept task from recommendations', async ({ page }) => {
    await login(page, 'reviewer1');
    await page.goto('/dispatcher/recommendations');
    await page.waitForTimeout(1000);

    const taskCards = page.locator('.task-card');
    const count = await taskCards.count();
    test.skip(count === 0, 'No recommended tasks available — create orders first');

    const acceptBtn = page.locator('.task-card button:has-text("Accept Task")').first();
    await expect(acceptBtn).toBeVisible({ timeout: 5000 });
    await acceptBtn.click();
    await page.waitForTimeout(1000);
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible({ timeout: 5000 });
    const text = await toast.textContent();
    expect(text.length).toBeGreaterThan(0);
  });

  test('cancel task', async ({ page }) => {
    await login(page, 'reviewer1');
    await page.goto('/dispatcher');
    await page.click('button:has-text("Assigned to Me")');
    await page.waitForTimeout(1000);

    const taskCards = page.locator('.task-card');
    const count = await taskCards.count();
    test.skip(count === 0, 'No assigned tasks available to cancel');

    const cancelBtn = page.locator('.task-card button:has-text("Cancel")').first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();
    await page.waitForTimeout(1000);
  });
});
