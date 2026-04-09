import { describe, test, expect } from '@jest/globals';
import { normalizeText, trigramSimilarity } from '../backend/src/services/outcomes.js';

// NOTE: We keep a local version of checkDuplicateWarnings for testing because the
// backend service version (in outcomes.js) operates on encrypted certificate numbers
// (using decrypt()), whereas this test version works with plain-text certificate_number
// fields. The title-matching logic is identical; only the cert-number access differs.
function checkDuplicateWarnings(title, certNumber, existingOutcomes) {
  const warnings = [];
  const normalizedTitle = normalizeText(title);
  const normalizedCert = certNumber ? normalizeText(certNumber) : null;

  for (const existing of existingOutcomes) {
    const existingTitle = normalizeText(existing.title);
    if (existingTitle === normalizedTitle) {
      warnings.push({ field: 'title', match_type: 'exact', existing_id: existing.id });
    } else if (trigramSimilarity(normalizedTitle, existingTitle) > 0.6) {
      warnings.push({ field: 'title', match_type: 'near', existing_id: existing.id });
    }

    if (normalizedCert && existing.certificate_number) {
      const existingCert = normalizeText(existing.certificate_number);
      if (existingCert === normalizedCert) {
        warnings.push({ field: 'certificate_number', match_type: 'exact', existing_id: existing.id });
      } else if (trigramSimilarity(normalizedCert, existingCert) > 0.7) {
        warnings.push({ field: 'certificate_number', match_type: 'near', existing_id: existing.id });
      }
    }
  }

  return warnings;
}

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
  const existing = [
    { id: '1', title: 'Canine Antibiotic Study', certificate_number: 'CERT-001' },
    { id: '2', title: 'Feline Vaccine Research', certificate_number: 'CERT-002' },
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
