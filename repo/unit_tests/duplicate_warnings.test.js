import { describe, test, expect, jest, beforeAll } from '@jest/globals';

// Mock the crypto module so decrypt returns the value as-is.
// This lets us test checkDuplicateWarnings with plain-text certificate values
// instead of requiring real encrypted data.
jest.unstable_mockModule('../backend/src/utils/crypto.js', () => ({
  encrypt: (val) => val,
  decrypt: (val) => val,
  maskCertificateNumber: (val) => val,
  computeFileChecksum: () => 'mock-checksum',
}));

// Import production functions after mocking
let normalizeText, trigramSimilarity, checkDuplicateWarnings;
beforeAll(async () => {
  const outcomes = await import('../backend/src/services/outcomes.js');
  normalizeText = outcomes.normalizeText;
  trigramSimilarity = outcomes.trigramSimilarity;
  checkDuplicateWarnings = outcomes.checkDuplicateWarnings;
});

describe('Text Normalization', () => {
  test('lowercases text', () => {
    expect(normalizeText('Hello World')).toBe('helloworld');
  });

  test('removes special characters', () => {
    expect(normalizeText('Test-Case #1')).toBe('testcase1');
  });

  test('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  test('handles null', () => {
    expect(normalizeText(null)).toBe('');
  });
});

describe('Trigram Similarity', () => {
  test('identical strings have high similarity', () => {
    expect(trigramSimilarity('hello', 'hello')).toBe(1);
  });

  test('completely different strings have low similarity', () => {
    expect(trigramSimilarity('abc', 'xyz')).toBeLessThan(0.3);
  });

  test('similar strings have moderate similarity', () => {
    const sim = trigramSimilarity('canine study', 'canine studies');
    expect(sim).toBeGreaterThan(0.6);
  });

  test('handles empty strings', () => {
    expect(trigramSimilarity('', 'test')).toBe(0);
    expect(trigramSimilarity('test', '')).toBe(0);
  });
});

describe('Duplicate Warnings', () => {
  // Use certificate_number_encrypted field to match the production function's expectations.
  // With our decrypt mock, the plain-text value is returned unchanged.
  const existing = [
    { id: '1', title: 'Canine Antibiotic Study', certificate_number_encrypted: 'CERT-001' },
    { id: '2', title: 'Feline Vaccine Research', certificate_number_encrypted: 'CERT-002' },
  ];

  test('exact title match produces exact warning', () => {
    const warnings = checkDuplicateWarnings('Canine Antibiotic Study', null, existing);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].match_type).toBe('exact');
    expect(warnings[0].field).toBe('title');
  });

  test('case-insensitive title match', () => {
    const warnings = checkDuplicateWarnings('canine antibiotic study', null, existing);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].match_type).toBe('exact');
  });

  test('near title match produces near warning', () => {
    const warnings = checkDuplicateWarnings('Canine Antibiotic Studies', null, existing);
    const titleWarnings = warnings.filter(w => w.field === 'title');
    expect(titleWarnings.length).toBeGreaterThanOrEqual(1);
  });

  test('exact certificate number match', () => {
    const warnings = checkDuplicateWarnings('New Title', 'CERT-001', existing);
    const certWarnings = warnings.filter(w => w.field === 'certificate_number');
    expect(certWarnings.length).toBeGreaterThanOrEqual(1);
    const exactMatch = certWarnings.find(w => w.match_type === 'exact');
    expect(exactMatch).toBeDefined();
    expect(exactMatch.existing_id).toBe('1');
  });

  test('no match for completely different title', () => {
    const warnings = checkDuplicateWarnings('Completely Unrelated Topic', null, existing);
    expect(warnings).toHaveLength(0);
  });

  test('duplicate warnings are non-blocking (just informational)', () => {
    const warnings = checkDuplicateWarnings('Canine Antibiotic Study', 'CERT-001', existing);
    expect(warnings.length).toBeGreaterThan(0);
    // Warnings don't throw errors - they're returned as data
  });
});
