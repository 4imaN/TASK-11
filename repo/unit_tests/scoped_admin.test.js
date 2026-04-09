import { describe, test, expect } from '@jest/globals';
import { isGlobalAdmin, getScopeFilter } from '../backend/src/middleware/auth.js';

describe('Scoped Admin Behavior', () => {
  const globalAdmin = {
    id: 'admin-1',
    permissions: ['admin.*'],
    scopes: [],
  };

  const scopedAdmin = {
    id: 'scoped-admin-1',
    permissions: ['admin.*'],
    scopes: [
      { scope_type: 'warehouse', scope_id: 'wh-001' },
      { scope_type: 'warehouse', scope_id: 'wh-002' },
    ],
  };

  const scopedAdminDeptOnly = {
    id: 'scoped-admin-2',
    permissions: ['admin.*'],
    scopes: [
      { scope_type: 'department', scope_id: 'dept-001' },
    ],
  };

  const unscopedDispatcher = {
    id: 'dispatcher-1',
    permissions: ['task.*'],
    scopes: [],
  };

  const scopedDispatcher = {
    id: 'dispatcher-2',
    permissions: ['task.*'],
    scopes: [
      { scope_type: 'warehouse', scope_id: 'wh-001' },
    ],
  };

  // ── isGlobalAdmin ──

  test('global admin (no scopes) is recognized', () => {
    expect(isGlobalAdmin(globalAdmin)).toBe(true);
  });

  test('scoped admin is NOT a global admin', () => {
    expect(isGlobalAdmin(scopedAdmin)).toBe(false);
  });

  test('non-admin user is not a global admin', () => {
    expect(isGlobalAdmin(unscopedDispatcher)).toBe(false);
  });

  test('null user is not a global admin', () => {
    expect(isGlobalAdmin(null)).toBe(false);
  });

  // ── getScopeFilter: admin.* no longer bypasses scope ──

  test('global admin gets null scope filter (unrestricted)', () => {
    expect(getScopeFilter(globalAdmin, 'warehouse')).toBeNull();
  });

  test('scoped admin gets actual scope IDs, NOT null', () => {
    const filter = getScopeFilter(scopedAdmin, 'warehouse');
    expect(filter).toEqual(['wh-001', 'wh-002']);
  });

  test('scoped admin with only department scopes gets empty array for warehouse (deny)', () => {
    const filter = getScopeFilter(scopedAdminDeptOnly, 'warehouse');
    expect(filter).toEqual([]);
  });

  test('scoped admin gets department scope IDs', () => {
    const filter = getScopeFilter(scopedAdminDeptOnly, 'department');
    expect(filter).toEqual(['dept-001']);
  });

  test('unscoped non-admin gets null (unrestricted)', () => {
    expect(getScopeFilter(unscopedDispatcher, 'warehouse')).toBeNull();
  });

  test('scoped non-admin gets scope IDs', () => {
    const filter = getScopeFilter(scopedDispatcher, 'warehouse');
    expect(filter).toEqual(['wh-001']);
  });

  test('scoped non-admin gets empty array for unmatched scope type', () => {
    const filter = getScopeFilter(scopedDispatcher, 'department');
    expect(filter).toEqual([]);
  });

  test('null user returns null', () => {
    expect(getScopeFilter(null, 'warehouse')).toBeNull();
  });
});
