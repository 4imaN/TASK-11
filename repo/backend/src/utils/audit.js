import { query } from '../db/pool.js';

export async function logAudit(userId, action, entityType, entityId, details, ipAddress, dbClient = null) {
  const masked = maskSensitiveDetails(details);
  const queryFn = dbClient ? dbClient.query.bind(dbClient) : query;
  await queryFn(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, action, entityType, entityId, JSON.stringify(masked), ipAddress]
  );
}

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'token', 'secret_key', 'secret',
  'certificate_number', 'storage_path', 'storage_path_encrypted',
  'certificate_number_encrypted', 'encryption_key', 'session_secret',
]);

export function maskSensitiveDetails(details, depth = 0) {
  if (depth > 10) return '[DEEP]';
  if (!details || typeof details !== 'object') return details;
  if (Array.isArray(details)) {
    return details.map(item => maskSensitiveDetails(item, depth + 1));
  }
  const masked = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      masked[key] = '[MASKED]';
    } else if (value && typeof value === 'object') {
      masked[key] = maskSensitiveDetails(value, depth + 1);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
