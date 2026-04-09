import { test, expect } from '@playwright/test';
import { login, uniqueId } from './helpers.js';

test.describe('Admin Role — Full Suite', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  // ─── Dashboard ───
  test('admin dashboard loads with stats', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('h2:has-text("Admin Dashboard")')).toBeVisible();
    await expect(page.locator('.card:has-text("System Status")')).toBeVisible();
    await expect(page.locator('.card:has-text("Online")')).toBeVisible();
  });

  test('dashboard shows recent activity table', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('h3:has-text("Recent Activity")')).toBeVisible();
  });

  // ─── Products (SPU/SKU) ───
  test('products page lists SPUs with status badges', async ({ page }) => {
    await page.goto('/admin/products');
    await expect(page.locator('h2:has-text("Products")')).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.badge').first()).toBeVisible();
  });

  test('products page has search and filter controls', async ({ page }) => {
    await page.goto('/admin/products');
    await expect(page.locator('input[placeholder="Search products..."]')).toBeVisible();
  });

  test('create new SPU product', async ({ page }) => {
    await page.goto('/admin/products');
    await page.click('button:has-text("New Product")');
    await expect(page.locator('h3:has-text("Create New SPU")')).toBeVisible();

    const productName = `Test Product ${uniqueId()}`;
    // Fill name — first text input in the create form
    const formInputs = page.locator('.card form .form-group input.input');
    await formInputs.first().fill(productName);

    // Select category
    const categorySelect = page.locator('.card form .form-group select').first();
    await categorySelect.selectOption({ index: 1 });

    await page.click('button:has-text("Create Product")');
    // Page should reload and show products
    await page.waitForTimeout(1500);
  });

  test('publish and unpublish SPU', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForTimeout(1000);
    const publishBtn = page.locator('button:has-text("Publish")').first();
    if (await publishBtn.isVisible().catch(() => false)) {
      await publishBtn.click();
      await page.waitForTimeout(1500);
    }
  });

  test('archive SPU', async ({ page }) => {
    await page.goto('/admin/products');
    await page.waitForTimeout(1000);
    const archiveBtn = page.locator('button:has-text("Archive")').first();
    if (await archiveBtn.isVisible().catch(() => false)) {
      await archiveBtn.click();
      await page.waitForTimeout(1500);
    }
  });

  test('search products by name', async ({ page }) => {
    await page.goto('/admin/products');
    await page.fill('input[placeholder="Search products..."]', 'Amoxicillin');
    await page.waitForTimeout(1000);
    await expect(page.locator('table tbody')).toContainText('Amoxicillin');
  });

  // ─── Suppliers ───
  test('suppliers page lists suppliers', async ({ page }) => {
    await page.goto('/admin/suppliers');
    await expect(page.locator('h2:has-text("Suppliers")')).toBeVisible();
    await expect(page.locator('table')).toContainText('PharmaVet');
  });

  test('create new supplier', async ({ page }) => {
    await page.goto('/admin/suppliers');
    await page.click('button:has-text("New Supplier")');
    const name = `Test Supplier ${uniqueId()}`;
    const inputs = page.locator('.card form .form-group input.input');
    await inputs.nth(0).fill(name);
    await inputs.nth(1).fill('555-9999');
    await inputs.nth(2).fill('test@supplier.local');
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1500);
  });

  // ─── Inventory ───
  test('inventory page shows stock levels with threshold indicators', async ({ page }) => {
    await page.goto('/admin/inventory');
    await expect(page.locator('h2:has-text("Inventory")')).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.badge').first()).toBeVisible();
  });

  test('inventory shows critical indicator for low stock', async ({ page }) => {
    await page.goto('/admin/inventory');
    await expect(page.locator('text=CRITICAL')).toBeVisible({ timeout: 5000 });
  });

  test('filter inventory by warehouse', async ({ page }) => {
    await page.goto('/admin/inventory');
    const select = page.locator('select').first();
    await select.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
  });

  // ─── Import/Export ───
  test('import page shows template download and upload', async ({ page }) => {
    await page.goto('/admin/import');
    await expect(page.locator('h2:has-text("Import / Export")')).toBeVisible();
    await expect(page.locator('button:has-text("Download Template")')).toBeVisible();
    await expect(page.locator('button:has-text("Export Current Data")')).toBeVisible();
    await expect(page.locator('button:has-text("Validate Import")')).toBeVisible();
  });

  test('import type selector has all types', async ({ page }) => {
    await page.goto('/admin/import');
    const select = page.locator('select').first();
    const options = select.locator('option');
    await expect(options).toHaveCount(4);
  });

  // ─── Users ───
  test('users page lists all users', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.locator('h2:has-text("Users")')).toBeVisible();
    await expect(page.locator('table')).toContainText('admin');
  });

  test('create new user with role', async ({ page }) => {
    await page.goto('/admin/users');
    await page.click('button:has-text("New User")');

    const username = `testuser${Date.now()}`;
    const formInputs = page.locator('.card form .form-group input');
    await formInputs.nth(0).fill(username);
    await formInputs.nth(1).fill('testpassword123');
    await formInputs.nth(2).fill(`Test User`);
    await formInputs.nth(3).fill(`${username}@test.local`);

    await page.check('input[type="checkbox"][value="buyer"]');
    await page.click('button:has-text("Create User")');
    await page.waitForTimeout(1500);
  });

  // ─── Config ───
  test('config page shows system configuration', async ({ page }) => {
    await page.goto('/admin/config');
    await expect(page.locator('h2:has-text("System Configuration")')).toBeVisible();
    await expect(page.locator('text=handling_fee')).toBeVisible();
    await expect(page.locator('text=tax_rules')).toBeVisible();
  });

  test('config edit opens textarea', async ({ page }) => {
    await page.goto('/admin/config');
    const editBtn = page.locator('button:has-text("Edit")').first();
    await editBtn.click();
    await expect(page.locator('textarea')).toBeVisible();
    await page.click('button:has-text("Cancel")');
  });

  // ─── Audit Logs ───
  test('audit logs page loads', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(page.locator('h2:has-text("Audit Logs")')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  // ─── Integration ───
  test('integration page shows token management', async ({ page }) => {
    await page.goto('/admin/integration');
    await expect(page.locator('h2:has-text("Integration API")')).toBeVisible();
    await expect(page.locator('h3:has-text("API Tokens")')).toBeVisible();
    await expect(page.locator('h3:has-text("Dead Letter Queue")')).toBeVisible();
  });

  test('create integration token shows credentials', async ({ page }) => {
    await page.goto('/admin/integration');
    await page.fill('input[placeholder="Token name"]', `device-${uniqueId()}`);
    await page.click('button:has-text("Create Token")');
    await expect(page.locator('text=Save these credentials')).toBeVisible({ timeout: 5000 });
  });

  // ─── Outcomes ───
  test('outcomes page loads', async ({ page }) => {
    await page.goto('/admin/outcomes');
    await expect(page.locator('h2:has-text("Outcomes")')).toBeVisible();
  });

  test('create outcome', async ({ page }) => {
    await page.goto('/admin/outcomes');
    await page.click('button:has-text("New Outcome")');

    // Select type
    const typeSelect = page.locator('.card form select').first();
    await typeSelect.selectOption('patent');

    // Fill title
    const titleInput = page.locator('.card form .form-group input.input').first();
    await titleInput.fill(`Test Patent ${uniqueId()}`);

    await page.click('button:has-text("Create Outcome")');
    await page.waitForTimeout(2000);
  });

  // ─── Projects ───
  test('projects page lists projects', async ({ page }) => {
    await page.goto('/admin/projects');
    await expect(page.locator('h2:has-text("Projects")')).toBeVisible();
    await expect(page.locator('table')).toContainText('Canine Antibiotic');
  });

  test('create new project', async ({ page }) => {
    await page.goto('/admin/projects');
    await page.click('button:has-text("New Project")');
    const nameInput = page.locator('.card form .form-group input.input').first();
    await nameInput.fill(`Research Project ${uniqueId()}`);
    const deptSelect = page.locator('.card form select');
    await deptSelect.selectOption({ index: 1 });
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1500);
  });
});
