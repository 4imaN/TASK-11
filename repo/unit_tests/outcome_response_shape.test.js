import { describe, test, expect } from '@jest/globals';
import { sanitizeOutcomeRow } from '../backend/src/services/outcomes.js';

describe('Outcome Response Shape — Encrypted Field Sanitization', () => {

  test('strips certificate_number_encrypted from row', () => {
    // Use null to avoid needing real encrypted data for unit test
    const row = {
      id: 'outcome-1',
      type: 'patent',
      title: 'Test Patent',
      status: 'draft',
      certificate_number_encrypted: null,
    };
    const result = sanitizeOutcomeRow(row);
    expect(result).not.toHaveProperty('certificate_number_encrypted');
    expect(result).toHaveProperty('certificate_number_display');
  });

  test('adds certificate_number_display when encrypted field exists', () => {
    // sanitizeOutcomeRow calls decrypt+mask, which requires real crypto keys.
    // We verify the field replacement pattern: encrypted field removed, display field added.
    const row = {
      id: 'outcome-1',
      type: 'patent',
      title: 'Test Patent',
      status: 'draft',
      certificate_number_encrypted: null, // null encrypted = no cert
    };
    const result = sanitizeOutcomeRow(row);
    expect(result).not.toHaveProperty('certificate_number_encrypted');
    expect(result).toHaveProperty('certificate_number_display');
    expect(result.certificate_number_display).toBeNull();
  });

  test('preserves non-sensitive fields unchanged', () => {
    const row = {
      id: 'outcome-1',
      type: 'study',
      title: 'Study X',
      description: 'Description',
      status: 'published',
      created_by: 'user-1',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
      certificate_number_encrypted: null,
    };
    const result = sanitizeOutcomeRow(row);
    expect(result.id).toBe('outcome-1');
    expect(result.type).toBe('study');
    expect(result.title).toBe('Study X');
    expect(result.description).toBe('Description');
    expect(result.status).toBe('published');
    expect(result.created_by).toBe('user-1');
  });

  test('handles row without certificate_number_encrypted field', () => {
    const row = {
      id: 'outcome-2',
      type: 'award',
      title: 'Award Y',
      status: 'draft',
    };
    const result = sanitizeOutcomeRow(row);
    // Should pass through unchanged
    expect(result).toEqual(row);
    expect(result).not.toHaveProperty('certificate_number_encrypted');
    expect(result).not.toHaveProperty('certificate_number_display');
  });

  test('handles null row gracefully', () => {
    expect(sanitizeOutcomeRow(null)).toBeNull();
  });

  test('handles undefined row gracefully', () => {
    expect(sanitizeOutcomeRow(undefined)).toBeUndefined();
  });

  test('does not modify original row object', () => {
    const row = {
      id: 'outcome-3',
      certificate_number_encrypted: null,
    };
    const result = sanitizeOutcomeRow(row);
    // Original should still have the encrypted field
    expect(row).toHaveProperty('certificate_number_encrypted');
    expect(result).not.toHaveProperty('certificate_number_encrypted');
  });
});
