import { describe, test, expect } from '@jest/globals';
import { validateContributionShares } from '../backend/src/services/outcomes.js';

describe('Contribution Share Validation', () => {
  test('empty projects list is valid', () => {
    expect(validateContributionShares([])).toEqual({ valid: true, total: 0 });
  });

  test('single project at 100% is valid', () => {
    const result = validateContributionShares([{ contribution_share: 100 }]);
    expect(result.valid).toBe(true);
    expect(result.total).toBe(100);
  });

  test('two projects summing to 100% is valid', () => {
    const result = validateContributionShares([
      { contribution_share: 60 },
      { contribution_share: 40 },
    ]);
    expect(result.valid).toBe(true);
  });

  test('projects summing to 50% is invalid', () => {
    const result = validateContributionShares([
      { contribution_share: 30 },
      { contribution_share: 20 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.total).toBe(50);
  });

  test('projects summing to 101% is invalid', () => {
    const result = validateContributionShares([
      { contribution_share: 60 },
      { contribution_share: 41 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.total).toBe(101);
  });

  test('handles decimal shares', () => {
    const result = validateContributionShares([
      { contribution_share: 33.33 },
      { contribution_share: 33.33 },
      { contribution_share: 33.34 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.total).toBe(100);
  });

  test('tolerance of 0.01 for floating point', () => {
    const result = validateContributionShares([
      { contribution_share: 33.33 },
      { contribution_share: 33.33 },
      { contribution_share: 33.33 },
    ]);
    // 99.99 is within 0.01 of 100
    expect(result.valid).toBe(true);
  });

  test('null projects is valid', () => {
    expect(validateContributionShares(null)).toEqual({ valid: true, total: 0 });
  });
});
