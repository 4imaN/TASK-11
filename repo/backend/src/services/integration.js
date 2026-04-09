import crypto from 'crypto';
import { query, transaction } from '../db/pool.js';
import { Errors } from '../utils/errors.js';
import { generateToken, hashToken, computeHMAC, encrypt } from '../utils/crypto.js';
import { logAudit } from '../utils/audit.js';

export async function createIntegrationToken(name) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const secretKey = generateToken();
  const secretKeyEncrypted = encrypt(secretKey);

  const result = await query(
    `INSERT INTO integration_tokens (name, token_hash, secret_key_encrypted)
     VALUES ($1, $2, $3) RETURNING id, name, created_at`,
    [name, tokenHash, secretKeyEncrypted]
  );

  return { ...result.rows[0], token, secret_key: secretKey };
}

export async function listIntegrationTokens() {
  const result = await query(
    'SELECT id, name, rate_limit, status, created_at FROM integration_tokens ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function verifySignature(tokenValue, timestamp, body, signature) {
  const tokenHash = hashToken(tokenValue);
  const tokenResult = await query(
    "SELECT * FROM integration_tokens WHERE token_hash = $1 AND status = 'active'",
    [tokenHash]
  );
  if (tokenResult.rows.length === 0) {
    throw Errors.authRequired();
  }

  const token = tokenResult.rows[0];
  const { decrypt: dec } = await import('../utils/crypto.js');
  const secretKey = dec(token.secret_key_encrypted);

  const payload = `${timestamp}.${typeof body === 'string' ? body : JSON.stringify(body)}`;
  const expectedSig = computeHMAC(secretKey, payload);

  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) {
    throw Errors.forbidden('Invalid signature format');
  }

  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw Errors.forbidden('Invalid request signature');
  }

  return token;
}

export async function checkRateLimit(tokenId, rateLimit) {
  const windowStart = new Date();
  windowStart.setSeconds(0, 0);

  const result = await query(
    `INSERT INTO rate_limit_entries (token_id, window_start, request_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (token_id, window_start)
     DO UPDATE SET request_count = rate_limit_entries.request_count + 1
     RETURNING request_count`,
    [tokenId, windowStart]
  );

  if (result.rows[0].request_count > (rateLimit || 60)) {
    throw Errors.rateLimited();
  }
}

export async function createIngestionJob(tokenId, payload) {
  const result = await query(
    `INSERT INTO ingestion_jobs (token_id, payload, status)
     VALUES ($1, $2, 'pending') RETURNING *`,
    [tokenId, JSON.stringify(payload)]
  );
  return result.rows[0];
}

export async function processIngestionJobs() {
  const jobs = await query(
    `SELECT * FROM ingestion_jobs
     WHERE status = 'pending' OR (status = 'failed' AND attempts < 5 AND next_retry_at <= NOW())
     ORDER BY created_at ASC LIMIT 10`
  );

  for (const job of jobs.rows) {
    try {
      await query(
        "UPDATE ingestion_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1",
        [job.id]
      );

      await processJob(job);

      await query(
        "UPDATE ingestion_jobs SET status = 'completed', updated_at = NOW() WHERE id = $1",
        [job.id]
      );
    } catch (err) {
      const newAttempts = job.attempts + 1;
      // Extract only safe metadata — never persist raw payload content
      const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
      const safeMeta = { entity_type: payload?.entity_type, action: payload?.action };
      const errorDetail = `Job ${job.id}: ${err.message} [${safeMeta.entity_type}/${safeMeta.action}]`;
      if (newAttempts >= 5) {
        await query(
          `UPDATE ingestion_jobs SET status = 'dead_letter', attempts = $1,
           last_error = $2, updated_at = NOW() WHERE id = $3`,
          [newAttempts, errorDetail, job.id]
        );
        await logAudit(null, 'ingestion_dead_letter', 'ingestion_job', job.id,
          { error: err.message, attempts: newAttempts, job_id: job.id, ...safeMeta }, null);
      } else {
        const backoffMs = Math.pow(2, newAttempts) * 1000;
        const nextRetry = new Date(Date.now() + backoffMs);
        await query(
          `UPDATE ingestion_jobs SET status = 'failed', attempts = $1,
           last_error = $2, next_retry_at = $3, updated_at = NOW() WHERE id = $4`,
          [newAttempts, errorDetail, nextRetry, job.id]
        );
        await logAudit(null, 'ingestion_retry', 'ingestion_job', job.id,
          { error: err.message, attempts: newAttempts, next_retry: nextRetry, job_id: job.id, ...safeMeta }, null);
      }
    }
  }
}

async function processJob(job) {
  const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
  const { entity_type, action } = payload;
  // Support both `data` and `payload` fields for backwards compat
  const data = payload.data || payload.payload;

  switch (entity_type) {
    case 'inventory':
      await processInventoryUpdate(action, data);
      break;
    case 'product':
      await processProductUpdate(action, data);
      break;
    default:
      throw new Error(`Unknown entity type: ${entity_type}`);
  }
}

async function processInventoryUpdate(action, data) {
  if (action === 'update') {
    const result = await query(
      `UPDATE inventory SET available_qty = $1, updated_at = NOW()
       WHERE sku_id = (SELECT id FROM skus WHERE sku_code = $2) AND warehouse_id = (SELECT id FROM warehouses WHERE code = $3)`,
      [data.available_qty, data.sku_code, data.warehouse_code]
    );
    if (result.rowCount === 0) {
      throw new Error(`Inventory update affected 0 rows: sku_code=${data.sku_code}, warehouse_code=${data.warehouse_code}`);
    }
  } else {
    throw new Error(`Unknown inventory action: ${action}`);
  }
}

async function processProductUpdate(action, data) {
  if (action === 'update_price') {
    const result = await query(
      `UPDATE sku_suppliers SET unit_price = $1, updated_at = NOW()
       WHERE sku_id = (SELECT id FROM skus WHERE sku_code = $2) AND supplier_id = (SELECT id FROM suppliers WHERE name = $3)`,
      [data.unit_price, data.sku_code, data.supplier_name]
    );
    if (result.rowCount === 0) {
      throw new Error(`Price update affected 0 rows: sku_code=${data.sku_code}, supplier=${data.supplier_name}`);
    }
  } else {
    throw new Error(`Unknown product action: ${action}`);
  }
}

export async function listDeadLetterJobs(filters = {}) {
  let sql = "SELECT * FROM ingestion_jobs WHERE status = 'dead_letter'";
  const params = [];
  let idx = 1;

  if (filters.token_id) {
    sql += ` AND token_id = $${idx++}`;
    params.push(filters.token_id);
  }

  sql += ' ORDER BY updated_at DESC';
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, (page - 1) * limit);

  const result = await query(sql, params);
  return result.rows;
}

export async function retryDeadLetterJob(jobId) {
  const result = await query(
    `UPDATE ingestion_jobs SET status = 'pending', attempts = 0, next_retry_at = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'dead_letter' RETURNING *`,
    [jobId]
  );
  if (result.rows.length === 0) throw Errors.notFound('Dead-letter job');
  return result.rows[0];
}
