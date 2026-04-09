import { describe, test, expect } from '@jest/globals';
import { computeThresholdState } from '../backend/src/services/inventory.js';

describe('Inventory Threshold Computation', () => {
  test('normal when well above warning', () => {
    expect(computeThresholdState(100, 0, 15, 5)).toBe('normal');
  });

  test('warning at exactly 15', () => {
    expect(computeThresholdState(15, 0, 15, 5)).toBe('warning');
  });

  test('warning at 10 (between 5 and 15)', () => {
    expect(computeThresholdState(10, 0, 15, 5)).toBe('warning');
  });

  test('critical at exactly 5', () => {
    expect(computeThresholdState(5, 0, 15, 5)).toBe('critical');
  });

  test('critical at 0', () => {
    expect(computeThresholdState(0, 0, 15, 5)).toBe('critical');
  });

  test('accounts for reserved quantity', () => {
    // 20 available, 16 reserved = 4 effective -> critical
    expect(computeThresholdState(20, 16, 15, 5)).toBe('critical');
  });

  test('reserved brings effective into warning zone', () => {
    // 25 available, 15 reserved = 10 effective -> warning
    expect(computeThresholdState(25, 15, 15, 5)).toBe('warning');
  });

  test('custom thresholds work', () => {
    expect(computeThresholdState(20, 0, 25, 10)).toBe('warning');
    expect(computeThresholdState(8, 0, 25, 10)).toBe('critical');
  });

  test('negative effective is critical', () => {
    expect(computeThresholdState(5, 10, 15, 5)).toBe('critical');
  });
});
