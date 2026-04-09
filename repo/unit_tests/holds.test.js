import { describe, test, expect } from '@jest/globals';
import { validateAdjacency } from '../backend/src/services/holds.js';

// Helper to create mock slot objects for a row
function makeSlots(rowCode, count, heldPositions = []) {
  return Array.from({ length: count }, (_, i) => ({
    row_code: rowCode,
    position_index: i + 1,
    status: heldPositions.includes(i + 1) ? 'held' : 'available',
  }));
}

describe('validateAdjacency', () => {
  test('selecting adjacent seats produces no errors', () => {
    const allSlots = makeSlots('A', 5);
    const errors = validateAdjacency([2, 3], allSlots, 'A');
    expect(errors).toEqual([]);
  });

  test('leaving a single-seat gap produces an error', () => {
    // Row of 5 seats, selecting 1 and 3 leaves position 2 as a single gap
    const allSlots = makeSlots('A', 5);
    const errors = validateAdjacency([1, 3], allSlots, 'A');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('position 2');
  });

  test('gap at row edge (position 1) does not produce an error', () => {
    // Row of 5, select positions 2 and 3 — position 1 is at the edge, not a gap error
    const allSlots = makeSlots('A', 5);
    const errors = validateAdjacency([2, 3], allSlots, 'A');
    expect(errors).toEqual([]);
  });

  test('no errors when all seats in a row are selected', () => {
    const allSlots = makeSlots('A', 4);
    const errors = validateAdjacency([1, 2, 3, 4], allSlots, 'A');
    expect(errors).toEqual([]);
  });

  test('already-held seats count as occupied for gap detection', () => {
    // Row of 5, position 2 is already held, selecting position 4 leaves position 3 as a gap
    const allSlots = makeSlots('A', 5, [2]);
    const errors = validateAdjacency([4], allSlots, 'A');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('position 3');
  });

  test('returns empty array for an empty row', () => {
    const errors = validateAdjacency([1], [], 'A');
    expect(errors).toEqual([]);
  });

  test('single seat selection in a row of one produces no errors', () => {
    const allSlots = makeSlots('A', 1);
    const errors = validateAdjacency([1], allSlots, 'A');
    expect(errors).toEqual([]);
  });
});

describe('Hold Duration Calculation', () => {
  test('10-minute hold from now', () => {
    const now = Date.now();
    const expiresAt = new Date(now + 10 * 60 * 1000);
    const remaining = expiresAt.getTime() - now;
    expect(remaining).toBe(600000);
  });

  test('countdown format', () => {
    const remaining = 5 * 60000 + 30000; // 5:30
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    expect(minutes).toBe(5);
    expect(seconds).toBe(30);
  });
});
