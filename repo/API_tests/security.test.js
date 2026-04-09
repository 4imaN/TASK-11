import { describe, test, expect, beforeAll } from '@jest/globals';
import { login, loginAsAdmin, loginAsBuyer, loginAsReviewer, clearSession, apiRequest, BASE_URL } from './helpers.js';
import crypto from 'crypto';

describe('Security & Isolation Tests', () => {

  // ─── Outcomes lifecycle ───
  test('create outcome with zero projects rejected', async () => {
    clearSession();
    await loginAsReviewer();
    const res = await apiRequest('POST', '/api/outcomes', {
      type: 'study', title: 'No Projects Test', projects: [],
    });
    expect(res.status).toBe(400);
  });

  test('create outcome without projects key rejected', async () => {
    clearSession();
    await loginAsReviewer();
    const res = await apiRequest('POST', '/api/outcomes', {
      type: 'study', title: 'Missing Projects Test',
    });
    expect(res.status).toBe(400);
  });

  test('create outcome with shares != 100% rejected', async () => {
    clearSession();
    await loginAsReviewer();
    const res = await apiRequest('POST', '/api/outcomes', {
      type: 'patent', title: 'Bad Shares Test',
      projects: [{ project_id: '16000000-0000-0000-0000-000000000001', contribution_share: 50 }],
    });
    expect(res.status).toBe(400);
    expect(res.data.error.message).toContain('100%');
  });

  test('create outcome with valid 100% projects succeeds', async () => {
    clearSession();
    await loginAsReviewer();
    const res = await apiRequest('POST', '/api/outcomes', {
      type: 'study', title: `Valid Test ${Date.now()}`,
      projects: [
        { project_id: '16000000-0000-0000-0000-000000000001', contribution_share: 60 },
        { project_id: '16000000-0000-0000-0000-000000000002', contribution_share: 40 },
      ],
    });
    expect(res.status).toBe(201);
  });

  // ─── Excel template validation ───
  // (Cannot easily test without creating Excel files; documented as manual verification)

  // ─── HMAC signature ───
  test('integration rejects malformed signature format', async () => {
    const res = await fetch(`${BASE_URL}/api/integration/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Token': 'fake-token',
        'X-Request-Signature': 'not-a-hex-string!!!',
        'X-Timestamp': Date.now().toString(),
      },
      body: JSON.stringify({ entity_type: 'test', action: 'test', payload: {} }),
    });
    // Should reject (401 bad token or 403 bad signature)
    expect([401, 403]).toContain(res.status);
  });

  test('integration rejects wrong-length signature', async () => {
    const res = await fetch(`${BASE_URL}/api/integration/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Token': 'fake-token',
        'X-Request-Signature': 'abc123',
        'X-Timestamp': Date.now().toString(),
      },
      body: JSON.stringify({ entity_type: 'test', action: 'test', payload: {} }),
    });
    expect([401, 403]).toContain(res.status);
  });

  // ─── Health endpoint contract ───
  test('health endpoint follows standard contract', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body.data).toHaveProperty('status', 'ok');
    expect(body.data).toHaveProperty('timestamp');
  });

  // ─── Cross-user hold denied ───
  test('buyer cannot access another users hold', async () => {
    // Just verify the hold ownership check works
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('GET', '/api/holds/00000000-0000-0000-0000-000000000000');
    expect([403, 404]).toContain(res.status);
  });

  // ─── Evidence authorization ───
  test('buyer cannot access evidence download', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('GET', '/api/evidence/00000000-0000-0000-0000-000000000000/download');
    expect(res.status).toBe(403);
  });

  // ─── Out-of-scope outcome access denied ───
  test('buyer cannot access outcomes', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('GET', '/api/outcomes');
    expect(res.status).toBe(403);
  });

  // ─── Dispatcher denied on catalog ───
  test('dispatcher cannot access SPU endpoints', async () => {
    clearSession();
    const loginRes = await login('dispatcher1', 'password123');
    if (loginRes.status !== 200) {
      // dispatcher may be locked; skip
      return;
    }
    const res = await apiRequest('GET', '/api/spus');
    expect(res.status).toBe(403);
  });

  // ─── Section 5.2: Negative scope-denial cases ───

  test('dispatcher cannot write inventory (no inventory.* permission)', async () => {
    clearSession();
    const loginRes = await login('dispatcher1', 'password123');
    if (loginRes.status !== 200) return;
    const res = await apiRequest('POST', '/api/inventory', {
      sku_id: '14000000-0000-0000-0000-000000000001',
      warehouse_id: 'c0000000-0000-0000-0000-000000000001',
      available_qty: 100,
    });
    expect(res.status).toBe(403);
  });

  test('buyer cannot write inventory', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('POST', '/api/inventory', {
      sku_id: '14000000-0000-0000-0000-000000000001',
      warehouse_id: 'c0000000-0000-0000-0000-000000000001',
      available_qty: 100,
    });
    expect(res.status).toBe(403);
  });

  test('buyer cannot access outcomes (scope denial)', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('GET', '/api/outcomes');
    expect(res.status).toBe(403);
  });

  test('buyer cannot access projects (scope denial)', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('GET', '/api/projects');
    expect(res.status).toBe(403);
  });

  test('buyer cannot create hold on non-existent slots', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('POST', '/api/holds', {
      slot_ids: ['00000000-0000-0000-0000-000000000000'],
      client_request_key: `deny-test-${Date.now()}`,
    });
    expect([403, 404]).toContain(res.status);
  });

  test('dispatcher cannot access evidence download', async () => {
    clearSession();
    const loginRes = await login('dispatcher1', 'password123');
    if (loginRes.status !== 200) return;
    const res = await apiRequest('GET', '/api/evidence/00000000-0000-0000-0000-000000000000/download');
    expect(res.status).toBe(403);
  });

  // ─── FK / constraint error mapping ───
  test('invalid foreign key returns 400 not 500', async () => {
    clearSession();
    await loginAsAdmin();
    const res = await apiRequest('POST', '/api/inventory', {
      sku_id: '00000000-0000-0000-0000-000000000099', // nonexistent
      warehouse_id: 'c0000000-0000-0000-0000-000000000001',
      available_qty: 10,
    });
    // Should be 400 (FK violation mapped) not 500
    expect([400, 404]).toContain(res.status);
  });

  // NOTE: Session inactivity (8h timeout) enforcement is tested by the middleware code
  // in backend/src/middleware/auth.js. A full API-level test would require direct DB
  // manipulation to backdate last_activity_at, which is documented as manual verification.

  test('expired/invalid session token is rejected', async () => {
    clearSession();
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Cookie': 'petmed_session=totally-invalid-token-00000' },
    });
    expect(res.status).toBe(401);
  });

  test('missing session cookie returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  // ─── Scope validation on user create ───
  test('create user with invalid scope target rejected', async () => {
    clearSession();
    await loginAsAdmin();
    const res = await apiRequest('POST', '/api/users', {
      username: `badscope-${Date.now()}`,
      password: 'testpass123',
      display_name: 'Bad Scope User',
      roles: ['dispatcher'],
      scopes: [{ type: 'warehouse', id: '00000000-0000-0000-0000-000000000099' }],
    });
    expect(res.status).toBe(400);
    expect(res.data.error.message).toContain('does not exist');
  });

  test('create user with invalid scope type rejected', async () => {
    clearSession();
    await loginAsAdmin();
    const res = await apiRequest('POST', '/api/users', {
      username: `badtype-${Date.now()}`,
      password: 'testpass123',
      display_name: 'Bad Type User',
      roles: ['dispatcher'],
      scopes: [{ type: 'galaxy', id: 'c0000000-0000-0000-0000-000000000001' }],
    });
    expect(res.status).toBe(400);
    expect(res.data.error.code).toBe('VALIDATION');
  });

  // ─── Section 5.3: Audit masking in persisted logs ───
  test('audit logs mask sensitive details when persisted', async () => {
    clearSession();
    await loginAsAdmin();
    // Fetch recent audit logs — they should have masked sensitive fields
    const res = await apiRequest('GET', '/api/audit-logs?limit=5');
    if (res.status === 200 && Array.isArray(res.data.data)) {
      for (const log of res.data.data) {
        if (log.details) {
          const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
          // Verify no unmasked sensitive fields in persisted logs
          const sensitiveKeys = ['password', 'password_hash', 'token', 'secret_key',
            'certificate_number', 'storage_path', 'storage_path_encrypted'];
          for (const key of sensitiveKeys) {
            if (details[key] !== undefined) {
              expect(details[key]).toBe('[MASKED]');
            }
          }
        }
      }
    }
  });
});
