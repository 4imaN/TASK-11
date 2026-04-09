import { describe, test, expect } from '@jest/globals';
import { computeFileChecksum } from '../backend/src/utils/crypto.js';

/**
 * Evidence integrity — production checksum function.
 *
 * Tests the REAL computeFileChecksum from crypto.js. The full
 * upload/download/tamper-detection path is tested in
 * API_tests/evidence_integrity.test.js (requires running DB).
 */

describe('Evidence Integrity — checksum (production)', () => {
  test('same content → same checksum', () => {
    const buf = Buffer.from('evidence content');
    expect(computeFileChecksum(buf)).toBe(computeFileChecksum(buf));
  });

  test('different content → different checksum', () => {
    expect(computeFileChecksum(Buffer.from('original')))
      .not.toBe(computeFileChecksum(Buffer.from('tampered')));
  });

  test('output is 64-char hex (SHA-256)', () => {
    expect(computeFileChecksum(Buffer.from('x'))).toMatch(/^[a-f0-9]{64}$/);
  });

  test('single byte difference is detected', () => {
    expect(computeFileChecksum(Buffer.from([1, 2, 3])))
      .not.toBe(computeFileChecksum(Buffer.from([1, 2, 4])));
  });
});
