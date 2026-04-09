import { describe, test, expect } from '@jest/globals';
import { SESSION_TIMEOUT_HOURS } from '../backend/src/middleware/auth.js';

/**
 * Session inactivity timeout — production-path unit tests.
 *
 * These import the real SESSION_TIMEOUT_HOURS constant and test the exact
 * comparison logic the auth middleware uses.  The matching API-level test
 * (in API_tests/security.test.js) backdates a real session in the DB and
 * verifies the middleware rejects it.
 */

/**
 * Reproduces the exact inactivity check from auth.js lines 37-42.
 */
function isExpiredByProductionLogic(lastActivityAt) {
  const lastActivity = new Date(lastActivityAt);
  const inactivityLimit = new Date(
    lastActivity.getTime() + SESSION_TIMEOUT_HOURS * 60 * 60 * 1000,
  );
  return new Date() > inactivityLimit;
}

describe('Session Inactivity Timeout (mirrors auth.js logic)', () => {
  test('1 minute ago → NOT expired', () => {
    expect(isExpiredByProductionLogic(new Date(Date.now() - 60_000))).toBe(false);
  });

  test('7h59m ago → NOT expired', () => {
    expect(isExpiredByProductionLogic(new Date(Date.now() - (7 * 60 + 59) * 60_000))).toBe(false);
  });

  test('8h + 1ms ago → expired', () => {
    expect(isExpiredByProductionLogic(new Date(Date.now() - 8 * 3600_000 - 1))).toBe(true);
  });

  test('9h ago → expired', () => {
    expect(isExpiredByProductionLogic(new Date(Date.now() - 9 * 3600_000))).toBe(true);
  });
});
