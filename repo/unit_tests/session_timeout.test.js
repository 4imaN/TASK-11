import { describe, test, expect } from '@jest/globals';
import { SESSION_TIMEOUT_HOURS, isSessionExpired } from '../backend/src/middleware/auth.js';

describe('Session Inactivity Timeout (production function)', () => {
  test('SESSION_TIMEOUT_HOURS is 8', () => {
    expect(SESSION_TIMEOUT_HOURS).toBe(8);
  });

  test('1 minute ago → NOT expired', () => {
    expect(isSessionExpired(new Date(Date.now() - 60_000))).toBe(false);
  });

  test('7h59m ago → NOT expired', () => {
    expect(isSessionExpired(new Date(Date.now() - (7 * 60 + 59) * 60_000))).toBe(false);
  });

  test('8h + 1ms ago → expired', () => {
    expect(isSessionExpired(new Date(Date.now() - 8 * 3600_000 - 1))).toBe(true);
  });

  test('9h ago → expired', () => {
    expect(isSessionExpired(new Date(Date.now() - 9 * 3600_000))).toBe(true);
  });

  test('custom now parameter works', () => {
    const lastActivity = new Date('2025-01-01T00:00:00Z');
    const withinWindow = new Date('2025-01-01T07:00:00Z');
    const pastWindow = new Date('2025-01-01T09:00:00Z');
    expect(isSessionExpired(lastActivity, withinWindow)).toBe(false);
    expect(isSessionExpired(lastActivity, pastWindow)).toBe(true);
  });
});
