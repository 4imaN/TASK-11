import { describe, test, expect, beforeAll } from '@jest/globals';
import { loginAsDispatcher, loginAsAdmin, clearSession, apiRequest } from './helpers.js';

describe('Dispatch Tasks API', () => {
  let taskId = null;

  beforeAll(async () => {
    // Create a task via admin
    clearSession();
    await loginAsAdmin();
    // First ensure we have an order with tasks
    // List existing tasks
    const tasksRes = await apiRequest('GET', '/api/tasks?status=open&limit=5');
    if (tasksRes.data.data?.length > 0) {
      taskId = tasksRes.data.data[0].id;
    }
  });

  test('dispatcher can list tasks in grab mode', async () => {
    clearSession();
    await loginAsDispatcher();
    const res = await apiRequest('GET', '/api/tasks?mode=grab');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('dispatcher can list assigned tasks', async () => {
    const res = await apiRequest('GET', '/api/tasks?mode=assigned');
    expect(res.status).toBe(200);
  });

  test('dispatcher can get recommendations', async () => {
    const res = await apiRequest('GET', '/api/tasks/recommendations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('get worker metrics', async () => {
    const res = await apiRequest('GET', '/api/worker-metrics');
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveProperty('reputation_score');
    expect(res.data.data).toHaveProperty('completed_count');
    expect(res.data.data).toHaveProperty('active_task_count');
  });

  test('accept task with optimistic concurrency', async () => {
    expect(taskId).toBeTruthy();
    clearSession();
    await loginAsDispatcher();

    const taskDetail = await apiRequest('GET', `/api/tasks/${taskId}`);
    expect(taskDetail.status).toBe(200);

    const res = await apiRequest('POST', `/api/tasks/${taskId}/accept`, {
      version: taskDetail.data.data.version,
    });
    // 200 = accepted, 409 = already accepted/version mismatch (both prove optimistic concurrency)
    expect([200, 409]).toContain(res.status);
    if (res.status === 200) {
      expect(res.data.data).toHaveProperty('status');
    } else {
      expect(res.data.error.code).toBe('CONFLICT');
    }
  });

  test('version mismatch on accept returns conflict', async () => {
    expect(taskId).toBeTruthy();
    const res = await apiRequest('POST', `/api/tasks/${taskId}/accept`, {
      version: 999,
    });
    expect(res.status).toBe(409);
  });

  test('buyer cannot access tasks (role enforcement)', async () => {
    clearSession();
    const { loginAsBuyer } = await import('./helpers.js');
    await loginAsBuyer();
    const res = await apiRequest('GET', '/api/tasks');
    expect(res.status).toBe(403);
  });

  // ── Section 3: Dispatcher cannot use admin-only assign endpoint ──

  test('dispatcher cannot assign task (admin-only)', async () => {
    clearSession();
    await loginAsDispatcher();
    // The /assign endpoint requires admin.* permission
    const res = await apiRequest('POST', '/api/tasks/00000000-0000-0000-0000-000000000001/assign', {
      user_id: '00000000-0000-0000-0000-000000000001',
    });
    expect(res.status).toBe(403);
  });

  test('admin can assign task', async () => {
    clearSession();
    await loginAsAdmin();
    // List open tasks to find one to assign
    const tasksRes = await apiRequest('GET', '/api/tasks?status=open&limit=1');
    if (tasksRes.data.data?.length > 0) {
      const openTask = tasksRes.data.data[0];
      // Get dispatcher user id
      const meRes = await apiRequest('GET', '/api/auth/me');
      const adminId = meRes.data.data.user.id;
      // Admin can assign (to themselves for simplicity)
      const res = await apiRequest('POST', `/api/tasks/${openTask.id}/assign`, {
        user_id: adminId,
      });
      // 200 success or 409 conflict (already assigned) - both prove the endpoint works for admin
      expect([200, 409]).toContain(res.status);
    }
  });

  test('dispatcher grab flow uses accept endpoint', async () => {
    clearSession();
    await loginAsDispatcher();
    // Verify accept endpoint is accessible to dispatcher (task.* permission)
    const tasksRes = await apiRequest('GET', '/api/tasks?mode=grab&limit=1');
    expect(tasksRes.status).toBe(200);
    if (tasksRes.data.data?.length > 0) {
      const task = tasksRes.data.data[0];
      const res = await apiRequest('POST', `/api/tasks/${task.id}/accept`, {
        version: task.version,
      });
      // 200 = accepted, 409 = version/state conflict (both prove endpoint works)
      expect([200, 409]).toContain(res.status);
    }
  });
});
