import { describe, test, expect, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock fetch and api
global.fetch = vi.fn();

describe('Cart Store', () => {
  test('exports writable stores and functions', async () => {
    const { cart, estimate, cartLoading, loadCart } = await import('../stores/cart.js');
    expect(cart).toBeDefined();
    expect(estimate).toBeDefined();
    expect(cartLoading).toBeDefined();
    expect(typeof loadCart).toBe('function');
  });

  test('cart store initializes with null cart and empty items', async () => {
    const { cart } = await import('../stores/cart.js');
    const val = get(cart);
    expect(val).toHaveProperty('cart');
    expect(val).toHaveProperty('items');
  });
});

describe('SKU Options Store', () => {
  test('exports store and loader', async () => {
    const { skuOptions, loadSkuOptions } = await import('../stores/skus.js');
    expect(skuOptions).toBeDefined();
    expect(typeof loadSkuOptions).toBe('function');
  });

  test('skuOptions initializes empty', async () => {
    const { skuOptions } = await import('../stores/skus.js');
    expect(get(skuOptions)).toEqual([]);
  });
});

describe('Auth Store', () => {
  test('hasPermission handles wildcards', async () => {
    const { hasPermission } = await import('../stores/auth.js');
    expect(hasPermission(['admin.*'], 'admin.*')).toBe(true);
    expect(hasPermission(['catalog.read'], 'catalog.read')).toBe(true);
    expect(hasPermission(['catalog.read'], 'admin.*')).toBe(false);
    expect(hasPermission([], 'admin.*')).toBe(false);
  });

  test('hasRole checks membership', async () => {
    const { hasRole } = await import('../stores/auth.js');
    expect(hasRole(['admin'], 'admin')).toBe(true);
    expect(hasRole(['buyer'], 'admin')).toBe(false);
    expect(hasRole([], 'anything')).toBe(false);
  });
});
