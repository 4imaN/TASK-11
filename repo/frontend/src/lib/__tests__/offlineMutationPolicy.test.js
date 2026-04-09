import { describe, test, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { isQueueableMutation } from '../offlineMutationPolicy.js';

// Mock localStorage
const storage = {};
vi.stubGlobal('localStorage', {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = val; },
  removeItem: (key) => { delete storage[key]; },
});

// Mock window.addEventListener
vi.stubGlobal('window', { addEventListener: vi.fn() });

describe('Canonical Offline Mutation Policy', () => {
  // Verify the single source of truth covers all critical operations

  test('holds create is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/holds')).toBe(false);
  });

  test('holds cancel is NOT queueable', () => {
    expect(isQueueableMutation('DELETE', '/holds/abc')).toBe(false);
  });

  test('holds checkout is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/holds/abc/checkout')).toBe(false);
  });

  test('task accept is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/tasks/abc/accept')).toBe(false);
  });

  test('task assign is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/tasks/abc/assign')).toBe(false);
  });

  test('task status is NOT queueable', () => {
    expect(isQueueableMutation('PATCH', '/tasks/abc/status')).toBe(false);
  });

  test('cart checkout is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/cart/checkout')).toBe(false);
  });

  test('auth mutations are NOT queueable', () => {
    expect(isQueueableMutation('POST', '/auth/login')).toBe(false);
    expect(isQueueableMutation('POST', '/auth/logout')).toBe(false);
  });

  test('evidence upload is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/outcomes/abc/evidence')).toBe(false);
  });

  test('catalog operations ARE queueable', () => {
    expect(isQueueableMutation('POST', '/spus')).toBe(true);
    expect(isQueueableMutation('PUT', '/spus/abc')).toBe(true);
    expect(isQueueableMutation('POST', '/skus')).toBe(true);
  });
});

describe('Mutation Queue (uses canonical policy)', () => {
  beforeEach(async () => {
    Object.keys(storage).forEach(k => delete storage[k]);
    // Set a user session so queuing is allowed
    const { setQueueUser } = await import('../mutationQueue.js');
    setQueueUser('test-user-001');
  });

  test('queues catalog mutations when offline', async () => {
    const { queueMutation, pendingMutations } = await import('../mutationQueue.js');
    queueMutation('POST', '/spus', { name: 'Test Product' });
    expect(get(pendingMutations)).toBeGreaterThanOrEqual(1);
  });

  test('refuses to queue checkout operations', async () => {
    const { queueMutation } = await import('../mutationQueue.js');
    expect(() => queueMutation('POST', '/cart/checkout', {})).toThrow('requires backend confirmation');
  });

  test('refuses to queue hold creation', async () => {
    const { queueMutation } = await import('../mutationQueue.js');
    expect(() => queueMutation('POST', '/holds', {})).toThrow('requires backend confirmation');
  });

  test('refuses to queue hold checkout', async () => {
    const { queueMutation } = await import('../mutationQueue.js');
    expect(() => queueMutation('POST', '/holds/abc/checkout', {})).toThrow('requires backend confirmation');
  });

  test('refuses to queue task accept', async () => {
    const { queueMutation } = await import('../mutationQueue.js');
    expect(() => queueMutation('POST', '/tasks/abc/accept', {})).toThrow('requires backend confirmation');
  });

  test('refuses to queue task status update', async () => {
    const { queueMutation } = await import('../mutationQueue.js');
    expect(() => queueMutation('PATCH', '/tasks/abc/status', {})).toThrow('requires backend confirmation');
  });

  test('refuses to queue task assign', async () => {
    const { queueMutation } = await import('../mutationQueue.js');
    expect(() => queueMutation('POST', '/tasks/abc/assign', {})).toThrow('requires backend confirmation');
  });

  test('refuses to queue evidence upload', async () => {
    const { queueMutation } = await import('../mutationQueue.js');
    expect(() => queueMutation('POST', '/outcomes/abc/evidence', {})).toThrow('requires backend confirmation');
  });

  test('refuses to queue auth mutations', async () => {
    const { queueMutation } = await import('../mutationQueue.js');
    expect(() => queueMutation('POST', '/auth/login', {})).toThrow('requires backend confirmation');
  });

  test('rejects queuing without user session', async () => {
    const { clearUserQueue, queueMutation } = await import('../mutationQueue.js');
    clearUserQueue(); // clears currentUserId
    expect(() => queueMutation('POST', '/spus', {})).toThrow('no user session');
  });

  test('clearUserQueue removes all entries', async () => {
    const { setQueueUser, queueMutation, clearUserQueue, pendingMutations } = await import('../mutationQueue.js');
    setQueueUser('test-user-001');
    queueMutation('POST', '/spus', { name: 'A' });
    queueMutation('PUT', '/spus/123', { name: 'B' });
    expect(get(pendingMutations)).toBeGreaterThanOrEqual(2);
    clearUserQueue();
    expect(get(pendingMutations)).toBe(0);
  });

  test('flushMutationQueue returns counts', async () => {
    const { flushMutationQueue } = await import('../mutationQueue.js');
    const result = await flushMutationQueue();
    expect(result).toHaveProperty('flushed');
    expect(result).toHaveProperty('failed');
  });
});
