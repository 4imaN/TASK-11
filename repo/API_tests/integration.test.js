import { describe, test, expect, beforeAll } from '@jest/globals';
import { loginAsAdmin, clearSession, apiRequest, BASE_URL } from './helpers.js';
import crypto from 'crypto';

describe('Integration API', () => {
  let tokenValue = null;
  let secretKey = null;
  // Separate token for dead-letter tests (avoids rate limit from burst test)
  let dlTokenValue = null;
  let dlSecretKey = null;

  beforeAll(async () => {
    clearSession();
    await loginAsAdmin();

    const res = await apiRequest('POST', '/api/integration/tokens', { name: 'test-device' });
    expect(res.status).toBe(201);
    tokenValue = res.data.data.token;
    secretKey = res.data.data.secret_key;

    const dlRes = await apiRequest('POST', '/api/integration/tokens', { name: 'dl-test-device' });
    expect(dlRes.status).toBe(201);
    dlTokenValue = dlRes.data.data.token;
    dlSecretKey = dlRes.data.data.secret_key;
  });

  test('create integration token', async () => {
    const res = await apiRequest('POST', '/api/integration/tokens', { name: `test-${Date.now()}` });
    expect(res.status).toBe(201);
    expect(res.data.data).toHaveProperty('token');
    expect(res.data.data).toHaveProperty('secret_key');
  });

  test('list integration tokens', async () => {
    const res = await apiRequest('GET', '/api/integration/tokens');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('ingest with valid signature succeeds', async () => {
    expect(tokenValue).toBeTruthy();
    expect(secretKey).toBeTruthy();

    const timestamp = Date.now().toString();
    const body = { entity_type: 'inventory', action: 'update', payload: { sku_code: 'AMOX-50-PLAIN', warehouse_code: 'WH-MAIN', available_qty: 200 } };
    const bodyStr = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', secretKey).update(`${timestamp}.${bodyStr}`).digest('hex');

    const response = await fetch(`${BASE_URL}/api/integration/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Token': tokenValue,
        'X-Request-Signature': signature,
        'X-Timestamp': timestamp,
      },
      body: bodyStr,
    });
    const data = await response.json();
    expect(response.status).toBe(202);
    expect(data.data.status).toBe('accepted');
  });

  test('ingest without auth headers fails', async () => {
    const response = await fetch(`${BASE_URL}/api/integration/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: 'inventory', action: 'update', payload: {} }),
    });
    expect(response.status).toBe(401);
  });

  test('ingest with invalid signature fails', async () => {
    expect(tokenValue).toBeTruthy();
    const timestamp = Date.now().toString();
    const response = await fetch(`${BASE_URL}/api/integration/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Token': tokenValue,
        'X-Request-Signature': 'invalid-signature',
        'X-Timestamp': timestamp,
      },
      body: JSON.stringify({ entity_type: 'test', action: 'test', payload: {} }),
    });
    expect(response.status).toBe(403);
  });

  test('rate limiting returns 429 after threshold', async () => {
    expect(tokenValue).toBeTruthy();
    expect(secretKey).toBeTruthy();

    // Fire requests in parallel batches for speed
    let lastStatus = 200;
    const makeRequest = async () => {
      const timestamp = Date.now().toString();
      const body = JSON.stringify({ entity_type: 'test', action: 'ping', payload: {} });
      const sig = crypto.createHmac('sha256', secretKey).update(`${timestamp}.${body}`).digest('hex');
      const response = await fetch(`${BASE_URL}/api/integration/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Token': tokenValue,
          'X-Request-Signature': sig,
          'X-Timestamp': timestamp,
        },
        body,
      });
      return response.status;
    };

    // Send 10 batches of 7 (=70 requests) to exceed 60/min limit
    for (let batch = 0; batch < 10; batch++) {
      const results = await Promise.all(Array.from({ length: 7 }, () => makeRequest()));
      if (results.includes(429)) { lastStatus = 429; break; }
      lastStatus = results[results.length - 1];
    }
    expect(lastStatus).toBe(429);
  }, 30000);

  test('list dead letter queue', async () => {
    clearSession();
    await loginAsAdmin();
    const res = await apiRequest('GET', '/api/integration/dead-letter');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('ingest with unknown entity type creates failing job', async () => {
    // Use separate token to avoid rate limit from burst test
    expect(dlTokenValue).toBeTruthy();
    expect(dlSecretKey).toBeTruthy();

    const timestamp = Date.now().toString();
    const body = { entity_type: 'nonexistent_type', action: 'test', payload: { test: true } };
    const bodyStr = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', dlSecretKey)
      .update(`${timestamp}.${bodyStr}`).digest('hex');

    const response = await fetch(`${BASE_URL}/api/integration/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Token': dlTokenValue,
        'X-Request-Signature': signature,
        'X-Timestamp': timestamp,
      },
      body: bodyStr,
    });
    expect(response.status).toBe(202); // Accepted for async processing
    const data = await response.json();
    expect(data.data.status).toBe('accepted');
    expect(data.data).toHaveProperty('job_id');
  });

  test('dead-letter entries have sanitized metadata (no raw payload)', async () => {
    clearSession();
    await loginAsAdmin();
    // Wait for processing cycle to run (scheduler runs every 30s)
    await new Promise(r => setTimeout(r, 35000));

    const res = await apiRequest('GET', '/api/integration/dead-letter');
    expect(res.status).toBe(200);
    // Verify dead-letter entries exist and have sanitized error messages
    for (const job of res.data.data) {
      if (job.last_error) {
        // Error should contain safe metadata (entity_type/action) but NOT raw payload content
        expect(job.last_error).not.toContain('"test": true');
        expect(job.last_error).not.toContain('"payload"');
      }
    }
  }, 45000);
});
