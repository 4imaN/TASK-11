import { describe, test, expect } from '@jest/globals';
import { maskSensitiveDetails } from '../backend/src/utils/audit.js';

/**
 * Audit masking — tests the PRODUCTION maskSensitiveDetails function
 * (exported from backend/src/utils/audit.js).
 */

describe('Audit Log Masking (production implementation)', () => {
  test('masks password field', () => {
    const result = maskSensitiveDetails({ username: 'admin', password: 'secret123' });
    expect(result.password).toBe('[MASKED]');
    expect(result.username).toBe('admin');
  });

  test('masks token field', () => {
    const result = maskSensitiveDetails({ token: 'abc123', name: 'test' });
    expect(result.token).toBe('[MASKED]');
    expect(result.name).toBe('test');
  });

  test('masks secret_key field', () => {
    const result = maskSensitiveDetails({ secret_key: 'my-key' });
    expect(result.secret_key).toBe('[MASKED]');
  });

  test('masks certificate_number field', () => {
    const result = maskSensitiveDetails({ certificate_number: 'CERT-001', title: 'Study' });
    expect(result.certificate_number).toBe('[MASKED]');
    expect(result.title).toBe('Study');
  });

  test('masks storage_path field', () => {
    const result = maskSensitiveDetails({ storage_path: '/evidence/file.pdf' });
    expect(result.storage_path).toBe('[MASKED]');
  });

  test('masks nested sensitive fields', () => {
    const result = maskSensitiveDetails({
      user: { name: 'test', password: 'secret' },
      action: 'login',
    });
    expect(result.user.password).toBe('[MASKED]');
    expect(result.user.name).toBe('test');
  });

  test('masks sensitive fields in arrays', () => {
    const result = maskSensitiveDetails([
      { token: 'abc', name: 'first' },
      { secret_key: 'def', name: 'second' },
    ]);
    expect(result[0].token).toBe('[MASKED]');
    expect(result[1].secret_key).toBe('[MASKED]');
  });

  test('preserves non-sensitive fields', () => {
    const result = maskSensitiveDetails({
      username: 'admin', action: 'login', ip: '127.0.0.1',
    });
    expect(result).toEqual({ username: 'admin', action: 'login', ip: '127.0.0.1' });
  });

  test('handles null / primitives', () => {
    expect(maskSensitiveDetails(null)).toBeNull();
    expect(maskSensitiveDetails('hello')).toBe('hello');
    expect(maskSensitiveDetails(42)).toBe(42);
  });

  test('case-insensitive key matching', () => {
    const result = maskSensitiveDetails({ Password: 'x', TOKEN: 'y' });
    expect(result.Password).toBe('[MASKED]');
    expect(result.TOKEN).toBe('[MASKED]');
  });
});
