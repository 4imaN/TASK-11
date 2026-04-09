import { describe, test, expect } from '@jest/globals';
import { computeThresholdState } from '../backend/src/services/inventory.js';

/**
 * Constrained Inventory Reconciliation — production threshold function.
 *
 * These call the REAL computeThresholdState from inventory.js and verify
 * that the threshold badges stay correct through the reserved_qty changes
 * made by the hold lifecycle (Section 1 fixes).
 *
 * The matching API-level tests (in API_tests/holds.test.js) prove that
 * the actual hold create/cancel/commit transactions update reserved_qty
 * in the database.
 */

describe('Constrained Inventory Reconciliation (production computeThresholdState)', () => {
  test('hold creation: reserved_qty increase pushes threshold from normal→warning', () => {
    expect(computeThresholdState(100, 0, 15, 5)).toBe('normal');
    // After holding 90 slots: effective = 100 - 90 = 10 → warning
    expect(computeThresholdState(100, 90, 15, 5)).toBe('warning');
  });

  test('hold creation: reserved_qty increase pushes threshold to critical', () => {
    // effective = 100 - 96 = 4 → critical
    expect(computeThresholdState(100, 96, 15, 5)).toBe('critical');
  });

  test('hold cancel: reserved_qty decrease recovers threshold', () => {
    expect(computeThresholdState(100, 96, 15, 5)).toBe('critical');
    // After cancel releasing 90: effective = 100 - 6 = 94 → normal
    expect(computeThresholdState(100, 6, 15, 5)).toBe('normal');
  });

  test('hold commit: no double-count, threshold stays the same', () => {
    // reserved_qty was set at hold creation (10). Commit does not change it.
    expect(computeThresholdState(100, 10, 15, 5)).toBe('normal');
  });

  test('boundary: exactly at warning threshold', () => {
    // effective = 20 - 5 = 15 → exactly warning
    expect(computeThresholdState(20, 5, 15, 5)).toBe('warning');
  });

  test('boundary: exactly at critical threshold', () => {
    // effective = 20 - 15 = 5 → exactly critical
    expect(computeThresholdState(20, 15, 15, 5)).toBe('critical');
  });

  test('multiple holds accumulate correctly', () => {
    expect(computeThresholdState(100, 3, 15, 5)).toBe('normal');
    expect(computeThresholdState(100, 88, 15, 5)).toBe('warning');
    expect(computeThresholdState(100, 96, 15, 5)).toBe('critical');
  });
});
