import { describe, test, expect } from '@jest/globals';
import { isQueueableMutation } from '../frontend/src/lib/offlineMutationPolicy.js';

/**
 * Unified offline mutation policy tests.
 *
 * These test the canonical isQueueableMutation function which is now the
 * single source of truth used by both offlineMutationPolicy.js and mutationQueue.js.
 */

describe('Unified Offline Mutation Policy', () => {

  // ── Non-queueable: holds ──

  test('POST /holds is NOT queueable (hold creation)', () => {
    expect(isQueueableMutation('POST', '/holds')).toBe(false);
  });

  test('DELETE /holds/:id is NOT queueable (hold cancel)', () => {
    expect(isQueueableMutation('DELETE', '/holds/abc-123')).toBe(false);
  });

  test('POST /holds/:id/checkout is NOT queueable (hold checkout)', () => {
    expect(isQueueableMutation('POST', '/holds/abc-123/checkout')).toBe(false);
  });

  // ── Non-queueable: cart checkout ──

  test('POST /cart/checkout is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/cart/checkout')).toBe(false);
  });

  // ── Non-queueable: task mutations ──

  test('POST /tasks/:id/accept is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/tasks/uuid-123/accept')).toBe(false);
  });

  test('PATCH /tasks/:id/status is NOT queueable', () => {
    expect(isQueueableMutation('PATCH', '/tasks/uuid-123/status')).toBe(false);
  });

  test('POST /tasks/:id/assign is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/tasks/uuid-123/assign')).toBe(false);
  });

  // ── Non-queueable: evidence upload ──

  test('POST /outcomes/:id/evidence is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/outcomes/uuid-123/evidence')).toBe(false);
  });

  // ── Non-queueable: auth ──

  test('POST /auth/login is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/auth/login')).toBe(false);
  });

  test('POST /auth/logout is NOT queueable', () => {
    expect(isQueueableMutation('POST', '/auth/logout')).toBe(false);
  });

  // ── Queueable: catalog operations ──

  test('POST /spus is queueable', () => {
    expect(isQueueableMutation('POST', '/spus')).toBe(true);
  });

  test('PUT /spus/:id is queueable', () => {
    expect(isQueueableMutation('PUT', '/spus/abc')).toBe(true);
  });

  test('POST /skus is queueable', () => {
    expect(isQueueableMutation('POST', '/skus')).toBe(true);
  });

  test('PUT /inventory/:id is queueable', () => {
    expect(isQueueableMutation('PUT', '/inventory/abc')).toBe(true);
  });

  // ── Queueable: non-restricted task reads (GET is never mutating) ──

  test('GET /tasks is queueable (read-only, not a mutation)', () => {
    expect(isQueueableMutation('GET', '/tasks')).toBe(true);
  });

  // ── Method case insensitivity ──

  test('method is case-insensitive', () => {
    expect(isQueueableMutation('post', '/holds')).toBe(false);
    expect(isQueueableMutation('Post', '/holds')).toBe(false);
    expect(isQueueableMutation('post', '/spus')).toBe(true);
  });

  // ── Edge cases ──

  test('POST /cart (not checkout) is queueable', () => {
    expect(isQueueableMutation('POST', '/cart')).toBe(true);
  });

  test('PUT /cart/items/:id is queueable', () => {
    expect(isQueueableMutation('PUT', '/cart/items/abc')).toBe(true);
  });

  test('DELETE /cart/items/:id is queueable', () => {
    expect(isQueueableMutation('DELETE', '/cart/items/abc')).toBe(true);
  });
});
