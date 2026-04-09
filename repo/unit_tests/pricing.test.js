import { describe, test, expect } from '@jest/globals';
import { validateMOQAndPackSize, roundMoney, getTaxRateForStore } from '../backend/src/services/pricing.js';

// Helper functions that compose the imported roundMoney for test convenience.
// These are not exported by the backend service (they are inlined in computeEstimate),
// so we define them locally for unit-test coverage of the underlying math.
function computeLineTotal(quantity, unitPrice) {
  return roundMoney(quantity * unitPrice);
}

function computeHandlingFee(config, splitCount) {
  if (config.per === 'supplier_split') {
    return roundMoney(config.amount * splitCount);
  }
  return roundMoney(config.amount);
}

function computeTax(taxableBase, taxRate) {
  return roundMoney(taxableBase * taxRate);
}

describe('MOQ Validation', () => {
  test('passes when quantity meets MOQ', () => {
    expect(validateMOQAndPackSize(12, 12, 12)).toEqual([]);
  });

  test('fails when quantity below MOQ', () => {
    const errors = validateMOQAndPackSize(5, 12, 12);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]).toContain('below minimum order quantity');
  });

  test('passes when quantity above MOQ and multiple of pack size', () => {
    expect(validateMOQAndPackSize(24, 12, 12)).toEqual([]);
  });

  test('fails when quantity is not multiple of pack size', () => {
    const errors = validateMOQAndPackSize(10, 6, 12);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('must be a multiple of pack size');
  });

  test('fails with both MOQ and pack size violations', () => {
    const errors = validateMOQAndPackSize(5, 12, 12);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  test('pack size of 1 always passes pack check', () => {
    expect(validateMOQAndPackSize(7, 1, 1)).toEqual([]);
  });

  test('exact MOQ with non-matching pack size', () => {
    const errors = validateMOQAndPackSize(6, 6, 4);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('pack size');
  });
});

describe('Pack-Size Validation', () => {
  test('case of 12 cannot be ordered as 10', () => {
    const errors = validateMOQAndPackSize(10, 1, 12);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('multiple of pack size 12');
  });

  test('case of 12 can be ordered as 12', () => {
    expect(validateMOQAndPackSize(12, 1, 12)).toEqual([]);
  });

  test('case of 12 can be ordered as 36', () => {
    expect(validateMOQAndPackSize(36, 1, 12)).toEqual([]);
  });

  test('case of 6 can be ordered as 6', () => {
    expect(validateMOQAndPackSize(6, 6, 6)).toEqual([]);
  });
});

describe('Pricing Calculations', () => {
  test('line total is quantity times unit price', () => {
    expect(computeLineTotal(12, 2.50)).toBe(30.00);
  });

  test('line total rounds to 2 decimal places', () => {
    expect(computeLineTotal(3, 1.333)).toBe(4.00);
  });

  test('handling fee per supplier split', () => {
    const config = { type: 'flat', amount: 5.00, per: 'supplier_split' };
    expect(computeHandlingFee(config, 2)).toBe(10.00);
  });

  test('tax calculation', () => {
    expect(computeTax(100, 0.08)).toBe(8.00);
    expect(computeTax(30, 0.085)).toBe(2.55);
  });

  test('tax rate lookup for specific store', () => {
    const config = {
      default_rate: 0.08,
      rules: [
        { store_code: 'ST-DT01', rate: 0.085 },
        { store_code: 'ST-SB01', rate: 0.07 },
      ],
    };
    expect(getTaxRateForStore(config, 'ST-DT01')).toBe(0.085);
    expect(getTaxRateForStore(config, 'ST-SB01')).toBe(0.07);
    expect(getTaxRateForStore(config, 'ST-UNKNOWN')).toBe(0.08);
    expect(getTaxRateForStore(config, null)).toBe(0.08);
  });
});

describe('Money Rounding', () => {
  test('rounds to 2 decimal places', () => {
    expect(roundMoney(1.006)).toBe(1.01);
    expect(roundMoney(1.004)).toBe(1.00);
    expect(roundMoney(100.00)).toBe(100.00);
    expect(roundMoney(3.456)).toBe(3.46);
  });
});
