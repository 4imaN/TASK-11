import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// We need to import after mocking
const { api } = await import('../lib/api.js');

describe('API client', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('throws on non-ok JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 401, statusText: 'Unauthorized',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ error: { code: 'AUTH_REQUIRED', message: 'Not authenticated' } }),
    });
    await expect(api.get('/test')).rejects.toThrow('Not authenticated');
  });

  it('handles empty 204 response', async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 204, statusText: 'No Content',
      headers: new Headers({ 'content-length': '0' }),
    });
    const result = await api.get('/test');
    expect(result.success).toBe(true);
  });

  it('handles non-JSON ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/plain' }),
    });
    const result = await api.get('/test');
    expect(result.success).toBeFalsy();
  });
});
