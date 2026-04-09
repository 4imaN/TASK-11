import pg from 'pg';
import { logger } from '../utils/logger.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://petmed:petmed_dev_password@localhost:5432/petmed',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('db', 'Unexpected database pool error', { error: err.message });
});

export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    logger.error('db', `Slow query (${duration}ms)`, { query: text.substring(0, 100), duration });
  }
  return result;
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
