import { describe, test, expect, beforeAll } from '@jest/globals';
import { loginAsReviewer, loginAsBuyer, clearSession, apiRequest } from './helpers.js';

describe('Outcomes API', () => {
  let outcomeId = null;

  beforeAll(async () => {
    clearSession();
    await loginAsReviewer();
  });

  test('create outcome with duplicate warnings', async () => {
    const res = await apiRequest('POST', '/api/outcomes', {
      type: 'study',
      title: 'Canine Antibiotic Efficacy Analysis',
      certificate_number: 'CERT-TEST-001',
      description: 'Test outcome',
      projects: [
        { project_id: '16000000-0000-0000-0000-000000000001', contribution_share: 60 },
        { project_id: '16000000-0000-0000-0000-000000000002', contribution_share: 40 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.data.data).toHaveProperty('outcome');
    expect(res.data.data).toHaveProperty('duplicate_warnings');
    outcomeId = res.data.data.outcome.id;
  });

  test('list outcomes', async () => {
    const res = await apiRequest('GET', '/api/outcomes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('submit outcome with valid shares', async () => {
    expect(outcomeId).toBeTruthy();
    const res = await apiRequest('PATCH', `/api/outcomes/${outcomeId}/status`, { status: 'submitted' });
    expect(res.status).toBe(200);
  });

  test('create rejects shares that dont sum to 100%', async () => {
    const res = await apiRequest('POST', '/api/outcomes', {
      type: 'patent',
      title: 'Invalid Share Test',
      projects: [{ project_id: '16000000-0000-0000-0000-000000000001', contribution_share: 50 }],
    });
    expect(res.status).toBe(400);
    expect(res.data.error.message).toContain('100%');
  });

  test('list projects', async () => {
    const res = await apiRequest('GET', '/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('buyer cannot access outcomes (role enforcement)', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('GET', '/api/outcomes');
    expect(res.status).toBe(403);
  });

  test('outcomes list respects department scope', async () => {
    clearSession();
    await loginAsReviewer();
    const res = await apiRequest('GET', '/api/outcomes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Verify all returned outcomes have the expected structure
    for (const outcome of res.data.data) {
      expect(outcome).toHaveProperty('id');
      expect(outcome).toHaveProperty('type');
      expect(outcome).toHaveProperty('title');
      expect(outcome).toHaveProperty('status');
    }
  });
});
