import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

describe('Auth Store', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('exports required functions', async () => {
    const auth = await import('../stores/auth.js');
    expect(auth.login).toBeDefined();
    expect(auth.logout).toBeDefined();
    expect(auth.checkAuth).toBeDefined();
    expect(auth.hasPermission).toBeDefined();
    expect(auth.hasRole).toBeDefined();
  });

  test('hasPermission matches wildcards', async () => {
    const { hasPermission } = await import('../stores/auth.js');
    expect(hasPermission(['admin.*'], 'admin.*')).toBe(true);
    expect(hasPermission(['catalog.read'], 'admin.*')).toBe(false);
    expect(hasPermission(['catalog.read'], 'catalog.read')).toBe(true);
  });

  test('hasRole checks role membership', async () => {
    const { hasRole } = await import('../stores/auth.js');
    expect(hasRole(['admin', 'buyer'], 'admin')).toBe(true);
    expect(hasRole(['buyer'], 'admin')).toBe(false);
    expect(hasRole([], 'admin')).toBe(false);
  });
});
