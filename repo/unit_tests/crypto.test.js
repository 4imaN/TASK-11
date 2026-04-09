import { describe, test, expect } from '@jest/globals';
import { computeHMAC, computeFileChecksum, maskCertificateNumber } from '../backend/src/utils/crypto.js';

describe('HMAC Signature Verification', () => {
  test('same key and payload produce same signature', () => {
    const sig1 = computeHMAC('secret123', 'payload data');
    const sig2 = computeHMAC('secret123', 'payload data');
    expect(sig1).toBe(sig2);
  });

  test('different key produces different signature', () => {
    const sig1 = computeHMAC('secret1', 'payload');
    const sig2 = computeHMAC('secret2', 'payload');
    expect(sig1).not.toBe(sig2);
  });

  test('different payload produces different signature', () => {
    const sig1 = computeHMAC('secret', 'payload1');
    const sig2 = computeHMAC('secret', 'payload2');
    expect(sig1).not.toBe(sig2);
  });

  test('produces hex string', () => {
    const sig = computeHMAC('key', 'data');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('File Checksum', () => {
  test('computes SHA-256 checksum', () => {
    const buffer = Buffer.from('test file content');
    const checksum = computeFileChecksum(buffer);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  test('same content produces same checksum', () => {
    const buf1 = Buffer.from('identical');
    const buf2 = Buffer.from('identical');
    expect(computeFileChecksum(buf1)).toBe(computeFileChecksum(buf2));
  });

  test('different content produces different checksum', () => {
    const buf1 = Buffer.from('content1');
    const buf2 = Buffer.from('content2');
    expect(computeFileChecksum(buf1)).not.toBe(computeFileChecksum(buf2));
  });
});

describe('Certificate Number Masking', () => {
  test('masks all but last 4 chars', () => {
    expect(maskCertificateNumber('CERT-12345')).toBe('******2345');
  });

  test('short cert number shows ****', () => {
    expect(maskCertificateNumber('AB')).toBe('****');
  });

  test('null returns ****', () => {
    expect(maskCertificateNumber(null)).toBe('****');
  });

  test('exactly 4 chars returns ****', () => {
    expect(maskCertificateNumber('ABCD')).toBe('****');
  });

  test('5 chars masks first', () => {
    expect(maskCertificateNumber('ABCDE')).toBe('*BCDE');
  });
});
