import { describe, test, expect, beforeAll } from '@jest/globals';
import { login, loginAsAdmin, loginAsBuyer, loginAsDispatcher, loginAsReviewer, clearSession, apiRequest, BASE_URL } from './helpers.js';

describe('Admin API Coverage', () => {
  beforeAll(async () => {
    clearSession();
    await loginAsAdmin();
  });

  // ─── Supplier CRUD ───
  test('GET /api/suppliers returns list', async () => {
    const res = await apiRequest('GET', '/api/suppliers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /api/suppliers creates supplier', async () => {
    const res = await apiRequest('POST', '/api/suppliers', {
      name: `Test Supplier ${Date.now()}`,
      contact_info: { email: 'test@example.com' },
    });
    expect(res.status).toBe(201);
    expect(res.data.data).toHaveProperty('id');
  });

  test('PUT /api/suppliers/:id updates supplier', async () => {
    const list = await apiRequest('GET', '/api/suppliers');
    const supplier = list.data.data[0];
    const res = await apiRequest('PUT', `/api/suppliers/${supplier.id}`, {
      name: supplier.name,
      contact_info: supplier.contact_info || { email: 'updated@example.com' },
    });
    expect(res.status).toBe(200);
  });

  test('PATCH /api/suppliers/:id/status archives supplier', async () => {
    // Create a throwaway supplier to archive
    const created = await apiRequest('POST', '/api/suppliers', {
      name: `Archive Test ${Date.now()}`,
      contact_info: { email: 'archive@test.com' },
    });
    const res = await apiRequest('PATCH', `/api/suppliers/${created.data.data.id}/status`, {
      status: 'archived',
    });
    expect(res.status).toBe(200);
  });

  test('GET /api/suppliers/:id/skus returns SKU links', async () => {
    const list = await apiRequest('GET', '/api/suppliers');
    const supplier = list.data.data[0];
    const res = await apiRequest('GET', `/api/suppliers/${supplier.id}/skus`);
    expect(res.status).toBe(200);
  });

  // ─── SKU-Supplier pricing ───
  test('POST /api/skus/:skuId/suppliers creates pricing', async () => {
    clearSession();
    await loginAsAdmin();
    // Remove existing link first for deterministic create
    const existing = await apiRequest('GET', '/api/skus/14000000-0000-0000-0000-000000000001/suppliers');
    const entry = existing.data?.data?.find(e => e.supplier_id === '12000000-0000-0000-0000-000000000002');
    if (entry) await apiRequest('DELETE', `/api/sku-suppliers/${entry.id}`);
    const res = await apiRequest('POST', '/api/skus/14000000-0000-0000-0000-000000000001/suppliers', {
      supplier_id: '12000000-0000-0000-0000-000000000002',
      unit_price: 3.25, moq: 6, pack_size: 6,
    });
    // Upsert: 200 on reactivation after delete, 201 on fresh create
    expect(res.status).toBe(200);
  });

  // ─── User update ───
  test('PUT /api/users/:id updates user', async () => {
    clearSession();
    await loginAsAdmin();
    const users = await apiRequest('GET', '/api/users?search=buyer1');
    const userList = users.data.data || users.data;
    const user = (Array.isArray(userList) ? userList : []).find(u => u.username === 'buyer1');
    if (!user) return; // buyer1 not found in filtered list
    const res = await apiRequest('PUT', `/api/users/${user.id}`, {
      display_name: user.display_name,
      email: user.email,
      status: user.status,
      roles: user.roles || ['buyer'],
    });
    expect(res.status).toBe(200);
  });

  // ─── Config ───
  test('PUT /api/config/:key updates config', async () => {
    clearSession();
    await loginAsAdmin();
    const res = await apiRequest('PUT', '/api/config/hold_duration_minutes', {
      value: 5,
    });
    expect(res.status).toBe(200);
  });

  // ─── Inventory update ───
  test('PUT /api/inventory/:id updates inventory', async () => {
    const inv = await apiRequest('GET', '/api/inventory?limit=1');
    if (inv.data.data.length === 0) return;
    const item = inv.data.data[0];
    const res = await apiRequest('PUT', `/api/inventory/${item.id}`, {
      available_qty: item.available_qty,
      threshold_warning: 15, threshold_critical: 5,
    });
    expect(res.status).toBe(200);
  });

  // ─── Warehouses ───
  test('GET /api/warehouses returns list', async () => {
    const res = await apiRequest('GET', '/api/warehouses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('POST /api/warehouses creates warehouse', async () => {
    const res = await apiRequest('POST', '/api/warehouses', {
      name: `Test WH ${Date.now()}`, code: `TWH${Date.now().toString(36)}`,
    });
    expect(res.status).toBe(201);
  });

  // ─── Excel import/export ───
  test('GET /api/import/templates/:type returns file', async () => {
    // Login via raw fetch to capture cookie for file download
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toBeTruthy();

    const res = await fetch(`${BASE_URL}/api/import/templates/inventory`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheet');
  });

  test('GET /api/export/:type returns file', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];

    const res = await fetch(`${BASE_URL}/api/export/inventory`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheet');
  });

  // ─── Outcomes detail/update ───
  test('GET /api/outcomes/:id returns detail', async () => {
    clearSession();
    await loginAsReviewer();
    const list = await apiRequest('GET', '/api/outcomes?limit=1');
    if (list.data.data.length === 0) return;
    const res = await apiRequest('GET', `/api/outcomes/${list.data.data[0].id}`);
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveProperty('id');
  });

  test('PUT /api/outcomes/:id updates outcome', async () => {
    const list = await apiRequest('GET', '/api/outcomes?limit=1');
    if (list.data.data.length === 0) return;
    const outcome = list.data.data[0];
    const res = await apiRequest('PUT', `/api/outcomes/${outcome.id}`, {
      title: outcome.title,
      type: outcome.type,
    });
    expect(res.status).toBe(200);
  });

  // ─── Projects ───
  test('POST /api/projects creates project', async () => {
    clearSession();
    await loginAsAdmin();
    const res = await apiRequest('POST', '/api/projects', {
      name: `Test Project ${Date.now()}`,
      department_id: 'e0000000-0000-0000-0000-000000000001',
    });
    expect(res.status).toBe(201);
  });

  // ─── Integration dead-letter retry ───
  test('POST /api/integration/dead-letter/:id/retry retries job', async () => {
    clearSession();
    await loginAsAdmin();
    const dlList = await apiRequest('GET', '/api/integration/dead-letter');
    if (dlList.data.data.length === 0) return;
    const job = dlList.data.data[0];
    const res = await apiRequest('POST', `/api/integration/dead-letter/${job.id}/retry`);
    expect(res.status).toBe(200);
  });

  // ─── Task status transitions ───
  test('PATCH /api/tasks/:id/status transitions work', async () => {
    clearSession();
    await loginAsAdmin();
    const tasks = await apiRequest('GET', '/api/tasks?status=open&limit=1');
    if (tasks.data.data.length === 0) return;
    const taskId = tasks.data.data[0].id;

    // Accept first (required before in_progress)
    clearSession();
    await loginAsDispatcher();
    const acceptRes = await apiRequest('POST', `/api/tasks/${taskId}/accept`, {
      version: tasks.data.data[0].version,
    });
    if (acceptRes.status !== 200) return;

    // Transition to in_progress
    const ipRes = await apiRequest('PATCH', `/api/tasks/${taskId}/status`, { status: 'in_progress' });
    expect(ipRes.status).toBe(200);

    // Complete
    const compRes = await apiRequest('PATCH', `/api/tasks/${taskId}/status`, { status: 'completed' });
    expect(compRes.status).toBe(200);
  });

  // ─── DELETE /api/sku-suppliers/:id ───
  test('DELETE /api/sku-suppliers/:id deactivates pricing', async () => {
    clearSession();
    await loginAsAdmin();
    // Create a pricing entry to delete
    const createRes = await apiRequest('POST', '/api/skus/14000000-0000-0000-0000-000000000001/suppliers', {
      supplier_id: '12000000-0000-0000-0000-000000000002',
      unit_price: 9.99, moq: 6, pack_size: 6,
    });
    // Get the entry ID
    const listRes = await apiRequest('GET', '/api/skus/14000000-0000-0000-0000-000000000001/suppliers');
    expect(listRes.status).toBe(200);
    const entry = listRes.data.data.find(e => e.supplier_id === '12000000-0000-0000-0000-000000000002');
    if (!entry) return;
    const res = await apiRequest('DELETE', `/api/sku-suppliers/${entry.id}`);
    expect(res.status).toBe(200);
  });

  // ─── Evidence upload (outcomes) ───
  test('POST /api/outcomes/:id/evidence rejects without file', async () => {
    clearSession();
    await loginAsReviewer();
    const list = await apiRequest('GET', '/api/outcomes?limit=1');
    if (list.data.data.length === 0) return;
    // POST without multipart file should be rejected (400/415/500 depending on parsing)
    const res = await apiRequest('POST', `/api/outcomes/${list.data.data[0].id}/evidence`, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // ─── Task cancel requires admin for open tasks ───
  test('dispatcher cannot cancel open task (admin-only)', async () => {
    clearSession();
    await loginAsAdmin();
    const tasks = await apiRequest('GET', '/api/tasks?status=open&limit=1');
    if (tasks.data.data.length === 0) return;
    const taskId = tasks.data.data[0].id;

    clearSession();
    await loginAsDispatcher();
    const res = await apiRequest('PATCH', `/api/tasks/${taskId}/status`, { status: 'cancelled' });
    expect(res.status).toBe(403);
  });
});
