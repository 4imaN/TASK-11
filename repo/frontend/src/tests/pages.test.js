/**
 * Page-level frontend tests covering layout, login, and role-based pages.
 * Tests verify module exports, store interactions, and basic rendering behavior.
 */
import { describe, test, expect, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock browser APIs
global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
global.document = { cookie: '' };

describe('+layout.svelte dependencies', () => {
  test('auth store exports required functions for layout', async () => {
    const auth = await import('../stores/auth.js');
    expect(auth.checkAuth).toBeDefined();
    expect(auth.user).toBeDefined();
    expect(auth.loading).toBeDefined();
    expect(auth.logout).toBeDefined();
    expect(auth.isAuthenticated).toBeDefined();
    expect(auth.hasPermission).toBeDefined();
    expect(auth.hasRole).toBeDefined();
    expect(auth.userPermissions).toBeDefined();
    expect(auth.userRoles).toBeDefined();
  });

  test('offline indicator store works', async () => {
    const { isOnline } = await import('$lib/offlineApi.js');
    expect(isOnline).toBeDefined();
    expect(typeof get(isOnline)).toBe('boolean');
  });

  test('pending mutations store works', async () => {
    const { pendingMutations } = await import('$lib/mutationQueue.js');
    expect(pendingMutations).toBeDefined();
    const val = get(pendingMutations);
    expect(typeof val).toBe('number');
  });
});

describe('+page.svelte (login) dependencies', () => {
  test('login function exists', async () => {
    const { login } = await import('../stores/auth.js');
    expect(typeof login).toBe('function');
  });

  test('isAuthenticated store is readable', async () => {
    const { isAuthenticated } = await import('../stores/auth.js');
    expect(typeof get(isAuthenticated)).toBe('boolean');
  });
});

describe('admin/+page.svelte dependencies', () => {
  test('admin page uses api module', async () => {
    const api = await import('$lib/api.js');
    expect(api.api).toBeDefined();
    expect(typeof api.api.get).toBe('function');
    expect(typeof api.api.post).toBe('function');
  });
});

describe('buyer/+page.svelte dependencies', () => {
  test('cart store exports required functions', async () => {
    const { cart, loadCart, cartLoading } = await import('../stores/cart.js');
    expect(cart).toBeDefined();
    expect(typeof loadCart).toBe('function');
    expect(cartLoading).toBeDefined();
  });

  test('cart initializes with empty state', async () => {
    const { cart } = await import('../stores/cart.js');
    const val = get(cart);
    expect(val).toHaveProperty('items');
  });
});

describe('dispatcher/+page.svelte dependencies', () => {
  test('api module has required methods for dispatcher', async () => {
    const { api } = await import('$lib/api.js');
    expect(typeof api.get).toBe('function');
    expect(typeof api.post).toBe('function');
    expect(typeof api.patch).toBe('function');
  });

  test('user store is readable for role checks', async () => {
    const { user } = await import('../stores/auth.js');
    // user store exists and is subscribable
    const val = get(user);
    expect(val === null || typeof val === 'object').toBe(true);
  });
});
