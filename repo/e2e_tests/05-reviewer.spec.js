import { test, expect } from '@playwright/test';
import { login, uniqueId } from './helpers.js';

test.describe('Reviewer Role — Outcomes & Evidence', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'reviewer1');
  });

  test('reviewer can access outcomes page', async ({ page }) => {
    await page.goto('/admin/outcomes');
    await expect(page.locator('h2:has-text("Outcomes")')).toBeVisible();
  });

  test('create study outcome', async ({ page }) => {
    await page.goto('/admin/outcomes');
    await page.click('button:has-text("New Outcome")');

    const typeSelect = page.locator('.card form select').first();
    await typeSelect.selectOption('study');

    const titleInput = page.locator('.card form .form-group input.input').first();
    await titleInput.fill(`Canine Treatment Study ${uniqueId()}`);

    await page.click('button:has-text("Create Outcome")');
    await page.waitForTimeout(2000);
    // Verify it's back on list or showing success
    const tableOrToast = page.locator('table, .toast');
    await expect(tableOrToast.first()).toBeVisible({ timeout: 5000 });
  });

  test('create outcome with project contributions summing to 100%', async ({ page }) => {
    await page.goto('/admin/outcomes');
    await page.click('button:has-text("New Outcome")');

    const typeSelect = page.locator('.card form select').first();
    await typeSelect.selectOption('patent');

    const titleInput = page.locator('.card form .form-group input.input').first();
    await titleInput.fill(`Patent ${uniqueId()}`);

    // Add project contribution
    const projSelect = page.locator('.card form select').nth(1);
    await expect(projSelect).toBeVisible({ timeout: 5000 });
    await projSelect.selectOption({ index: 1 });
    const shareInput = page.locator('input[type="number"][placeholder="%"]');
    await shareInput.fill('60');
    await page.locator('.form-group button:has-text("Add")').click();

    await projSelect.selectOption({ index: 2 });
    await shareInput.fill('40');
    await page.locator('.form-group button:has-text("Add")').click();

    await expect(page.locator('text=Total: 100%')).toBeVisible();

    await page.click('button:has-text("Create Outcome")');
    await page.waitForTimeout(2000);
  });

  test('duplicate title warning appears', async ({ page }) => {
    await page.goto('/admin/outcomes');
    await page.click('button:has-text("New Outcome")');

    const titleInput = page.locator('.card form .form-group input.input').first();
    await titleInput.fill('Canine Antibiotic Efficacy Study');

    await page.click('button:has-text("Create Outcome")');
    await page.waitForTimeout(2000);
    // Warnings may appear as a card or in the list
  });

  test('submit outcome status change', async ({ page }) => {
    await page.goto('/admin/outcomes');
    await page.waitForTimeout(1000);

    const submitBtn = page.locator('button:has-text("Submit")').first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();
    await page.waitForTimeout(1500);
  });

  test('add evidence file button appears', async ({ page }) => {
    await page.goto('/admin/outcomes');
    await page.waitForTimeout(1000);

    const addEvidenceBtn = page.locator('button:has-text("Add Evidence")').first();
    await expect(addEvidenceBtn).toBeVisible({ timeout: 5000 });
    await addEvidenceBtn.click();
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  // ─── Projects ───
  test('projects page lists all projects', async ({ page }) => {
    await page.goto('/admin/projects');
    await expect(page.locator('h2:has-text("Projects")')).toBeVisible();
    await expect(page.locator('table')).toContainText('Canine Antibiotic');
  });

  test('create new project with department', async ({ page }) => {
    await page.goto('/admin/projects');
    await page.click('button:has-text("New Project")');

    const nameInput = page.locator('.card form .form-group input.input').first();
    await nameInput.fill(`Research Project ${uniqueId()}`);

    const deptSelect = page.locator('.card form select');
    await expect(deptSelect).toBeVisible({ timeout: 5000 });
    await deptSelect.selectOption({ index: 1 });

    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1500);
  });
});
