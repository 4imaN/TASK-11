import { describe, test, expect, beforeAll } from '@jest/globals';
import { login, loginAsAdmin, clearSession, apiRequest } from './helpers.js';

describe('Authentication API', () => {
  let lockoutTestUser = 'lockout_test_user';

  beforeAll(async () => {
    clearSession();
    // Create a throwaway user for the lockout test
    await login('admin', 'password123');
    await apiRequest('POST', '/api/users', {
      username: lockoutTestUser,
      password: 'password123',
      display_name: 'Lockout Test',
      roles: ['buyer'],
    }).catch(() => {}); // ignore if already exists
    clearSession();
  });

  test('successful login returns user data', async () => {
    const res = await login('admin', 'password123');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.user.username).toBe('admin');
    expect(res.data.data.user.roles).toContain('admin');
  });

  test('invalid password returns 401', async () => {
    clearSession();
    const res = await login('admin', 'wrongpassword');
    expect(res.status).toBe(401);
    expect(res.data.error.code).toBe('AUTH_INVALID');
  });

  test('nonexistent user returns 401', async () => {
    clearSession();
    const res = await login('nonexistent', 'password123');
    expect(res.status).toBe(401);
  });

  test('account lockout after 5 failed attempts', async () => {
    clearSession();
    for (let i = 0; i < 5; i++) {
      await login(lockoutTestUser, 'wrongpassword');
    }
    const res = await login(lockoutTestUser, 'wrongpassword');
    expect(res.status).toBe(423);
    expect(res.data.error.code).toBe('AUTH_LOCKED');
  });

  test('authenticated user can get profile', async () => {
    await loginAsAdmin();
    const res = await apiRequest('GET', '/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.data.data.user.username).toBe('admin');
  });

  test('unauthenticated request returns 401', async () => {
    clearSession();
    const res = await apiRequest('GET', '/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('logout clears session', async () => {
    await loginAsAdmin();
    const logoutRes = await apiRequest('POST', '/api/auth/logout');
    expect(logoutRes.status).toBe(200);

    clearSession();
    const res = await apiRequest('GET', '/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('non-admin cannot access roles endpoint', async () => {
    clearSession();
    await login('buyer1', 'password123');
    const res = await apiRequest('GET', '/api/roles');
    expect(res.status).toBe(403);
  });

  test('non-admin cannot access config endpoint', async () => {
    const res = await apiRequest('GET', '/api/config');
    expect(res.status).toBe(403);
  });

  test('non-admin cannot access audit logs', async () => {
    const res = await apiRequest('GET', '/api/audit-logs');
    expect(res.status).toBe(403);
  });
});
