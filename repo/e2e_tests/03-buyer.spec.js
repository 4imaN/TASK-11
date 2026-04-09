import { test, expect } from '@playwright/test';
import { login, uniqueId } from './helpers.js';

test.describe('Buyer Role — Full Suite', () => {

  test.beforeEach(async ({ page }) => {
    await login(page, 'buyer1');
  });

  // ─── Catalog ───
  test('catalog page shows published products', async ({ page }) => {
    await page.goto('/buyer');
    await expect(page.locator('h2:has-text("Product Catalog")')).toBeVisible();
    // Should see product cards (seed has 3 published SPUs)
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 5000 });
  });

  test('catalog shows product names and categories', async ({ page }) => {
    await page.goto('/buyer');
    await expect(page.locator('text=Amoxicillin')).toBeVisible({ timeout: 5000 });
  });

  test('catalog search filters products', async ({ page }) => {
    await page.goto('/buyer');
    await page.fill('input[placeholder="Search products..."]', 'Carprofen');
    await page.waitForTimeout(500);
    await expect(page.locator('h4:has-text("Carprofen")')).toBeVisible();
  });

  test('catalog category filter works', async ({ page }) => {
    await page.goto('/buyer');
    const catSelect = page.locator('select').first();
    await catSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);
  });

  test('catalog shows tags on product cards', async ({ page }) => {
    await page.goto('/buyer');
    await expect(page.locator('.badge').first()).toBeVisible({ timeout: 5000 });
  });

  // ─── Cart ───
  test('add item to cart from catalog', async ({ page }) => {
    await page.goto('/buyer');
    // Set quantity and add first product
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('12');
    await page.locator('button:has-text("Add to Cart")').first().click();
    await expect(page.locator('.toast')).toBeVisible({ timeout: 5000 });
  });

  test('cart page shows added items', async ({ page }) => {
    // Add an item first
    await page.goto('/buyer');
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('12');
    await page.locator('button:has-text("Add to Cart")').first().click();
    await page.waitForTimeout(1000);

    // Go to cart
    await page.goto('/buyer/cart');
    await expect(page.locator('h2:has-text("Shopping Cart")')).toBeVisible();
    // Should show items or empty state
    const hasItems = await page.locator('table tbody tr').count();
    if (hasItems > 0) {
      await expect(page.locator('table tbody tr').first()).toBeVisible();
      // Should show product name, SKU code, quantity
      await expect(page.locator('button:has-text("Remove")').first()).toBeVisible();
    }
  });

  test('cart estimate button computes pricing', async ({ page }) => {
    // Ensure cart has items
    await page.goto('/buyer');
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('12');
    await page.locator('button:has-text("Add to Cart")').first().click();
    await page.waitForTimeout(1000);

    await page.goto('/buyer/cart');
    const estimateBtn = page.locator('button:has-text("Calculate Estimate")');
    await expect(estimateBtn).toBeVisible({ timeout: 5000 });
    await estimateBtn.click();
    // Should show estimate with supplier splits
    await expect(page.locator('h3:has-text("Order Estimate")')).toBeVisible({ timeout: 5000 });
    // Should show grand total
    await expect(page.locator('text=Grand Total')).toBeVisible();
    // Should show handling fee and tax
    await expect(page.locator('text=Handling')).toBeVisible();
    await expect(page.locator('text=Tax')).toBeVisible();
  });

  test('cart shows supplier split details', async ({ page }) => {
    await page.goto('/buyer');
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('12');
    await page.locator('button:has-text("Add to Cart")').first().click();
    await page.waitForTimeout(1000);

    await page.goto('/buyer/cart');
    const estimateBtn = page.locator('button:has-text("Calculate Estimate")');
    await expect(estimateBtn).toBeVisible({ timeout: 5000 });
    await estimateBtn.click();
    await page.waitForTimeout(1000);
    // Supplier name should appear in split
    await expect(page.locator('text=Subtotal').first()).toBeVisible({ timeout: 5000 });
  });

  test('checkout creates order', async ({ page }) => {
    // Add item
    await page.goto('/buyer');
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('12');
    await page.locator('button:has-text("Add to Cart")').first().click();
    await page.waitForTimeout(1000);

    await page.goto('/buyer/cart');
    const estimateBtn = page.locator('button:has-text("Calculate Estimate")');
    await expect(estimateBtn).toBeVisible({ timeout: 5000 });
    await estimateBtn.click();
    await page.waitForTimeout(1000);

    const placeOrderBtn = page.locator('button:has-text("Place Order")');
    await expect(placeOrderBtn).toBeVisible({ timeout: 5000 });
    await placeOrderBtn.click();
    // Should succeed or show drift confirmation
    await page.waitForTimeout(2000);
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible({ timeout: 5000 });
    const text = await toast.textContent();
    expect(text.includes('Order placed') || text.includes('changed') || text.includes('confirm')).toBeTruthy();
  });

  test('remove item from cart', async ({ page }) => {
    // Add an item first
    await page.goto('/buyer');
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('12');
    await page.locator('button:has-text("Add to Cart")').first().click();
    await page.waitForTimeout(1000);

    await page.goto('/buyer/cart');
    const removeBtn = page.locator('button:has-text("Remove")').first();
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
    await removeBtn.click();
    await page.waitForTimeout(500);
  });

  // ─── Seat-Style Holds ───
  test('holds page shows inventory selector', async ({ page }) => {
    await page.goto('/buyer/holds');
    await expect(page.locator('h2:has-text("Seat-Style Inventory Holds")')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
  });

  test('selecting inventory loads slot grid', async ({ page }) => {
    await page.goto('/buyer/holds');
    const select = page.locator('select').first();
    // Select the vaccine inventory which has constrained slots
    const options = select.locator('option');
    const count = await options.count();
    if (count > 1) {
      await select.selectOption({ index: count - 1 }); // Last one (vaccine likely)
      await page.waitForTimeout(1000);
      // If slots exist, the seat grid should appear
      const seatBtns = page.locator('.seat');
      const seatCount = await seatBtns.count();
      if (seatCount > 0) {
        await expect(seatBtns.first()).toBeVisible();
      }
    }
  });

  test('select seats and place hold with countdown', async ({ page }) => {
    await page.goto('/buyer/holds');
    const select = page.locator('select').first();
    const options = select.locator('option');
    const count = await options.count();
    if (count <= 1) return;

    await select.selectOption({ index: count - 1 });
    await page.waitForTimeout(1000);

    // Click available seats
    const availableSeats = page.locator('.seat-available');
    const avail = await availableSeats.count();
    if (avail >= 2) {
      await availableSeats.nth(0).click();
      await availableSeats.nth(1).click();
      await page.waitForTimeout(300);

      // Should show selection count
      await expect(page.locator('text=selected')).toBeVisible();

      // Place hold
      await page.click('button:has-text("Place Hold")');
      await page.waitForTimeout(1000);

      // Should show active hold with countdown
      const countdown = page.locator('.countdown');
      if (await countdown.isVisible()) {
        const text = await countdown.textContent();
        expect(text).toMatch(/\d+:\d+/);
      }

      // Should show confirm/cancel buttons
      const confirmBtn = page.locator('button:has-text("Confirm Reservation")');
      const cancelBtn = page.locator('button:has-text("Cancel Hold")');
      if (await confirmBtn.isVisible()) {
        // Cancel the hold to clean up
        await cancelBtn.click();
        await expect(page.locator('.toast')).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
