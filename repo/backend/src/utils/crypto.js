import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key && process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY environment variable must be set in production');
  }
  const keyStr = key || '0123456789abcdef0123456789abcdef';
  if (keyStr.length < 32) {
    throw new Error(`ENCRYPTION_KEY must be at least 32 characters (got ${keyStr.length})`);
  }
  return Buffer.from(keyStr, 'utf8').subarray(0, 32);
}

export function encrypt(text) {
  if (!text) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText) {
  if (!encryptedText) return null;
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function maskCertificateNumber(certNum) {
  if (!certNum || certNum.length <= 4) return '****';
  return '*'.repeat(certNum.length - 4) + certNum.slice(-4);
}

export function maskFilePath(path) {
  if (!path) return '[protected]';
  return '[protected-path]';
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function computeHMAC(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function computeFileChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
