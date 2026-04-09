import { describe, test, expect } from '@jest/globals';
import { validateAdjacency } from '../backend/src/services/holds.js';

function makeSlots(rowCode, count, occupiedPositions = []) {
  return Array.from({ length: count }, (_, i) => ({
    row_code: rowCode,
    position_index: i + 1,
    status: occupiedPositions.includes(i + 1) ? 'held' : 'available',
  }));
}

describe('Adjacency Gap Validator', () => {
  test('allows selecting adjacent seats', () => {
    const slots = makeSlots('A', 10);
    const errors = validateAdjacency([3, 4, 5], slots, 'A');
    expect(errors).toEqual([]);
  });

  test('allows selecting seats at row end with gap', () => {
    const slots = makeSlots('A', 5);
    const errors = validateAdjacency([1, 2, 4, 5], slots, 'A');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('single-seat gap at position 3');
  });

  test('rejects selection leaving single gap in middle', () => {
    const slots = makeSlots('A', 10);
    // Select 3,4,6,7 — leaves gap at 5
    const errors = validateAdjacency([3, 4, 6, 7], slots, 'A');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('position 5');
  });

  test('allows gap at row start (position 1)', () => {
    const slots = makeSlots('A', 5);
    // Select 2,3,4,5 — gap at position 1 which is row start
    const errors = validateAdjacency([2, 3, 4, 5], slots, 'A');
    expect(errors).toEqual([]);
  });

  test('allows gap at row end (last position)', () => {
    const slots = makeSlots('A', 5);
    // Select 1,2,3,4 — gap at position 5 which is row end
    const errors = validateAdjacency([1, 2, 3, 4], slots, 'A');
    expect(errors).toEqual([]);
  });

  test('works with already occupied seats', () => {
    // Seats 2,3 are held, selecting 5 leaves gap at 4
    const slots = makeSlots('A', 6, [2, 3]);
    const errors = validateAdjacency([5], slots, 'A');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('position 4');
  });

  test('no errors on empty selection', () => {
    const slots = makeSlots('A', 5);
    const errors = validateAdjacency([], slots, 'A');
    expect(errors).toEqual([]);
  });

  test('single seat selection is fine when no gap created', () => {
    const slots = makeSlots('A', 5);
    const errors = validateAdjacency([1], slots, 'A');
    expect(errors).toEqual([]);
  });

  test('multiple gaps detected', () => {
    const slots = makeSlots('A', 10);
    // Select 1,3,5,7,9 — gaps at 2,4,6,8
    const errors = validateAdjacency([1, 3, 5, 7, 9], slots, 'A');
    expect(errors.length).toBe(4);
  });
});
