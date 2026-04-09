import { api } from './api.js';
import { cacheGet, cacheSet } from './cache.js';
import { writable } from 'svelte/store';
import { isQueueableMutation } from './offlineMutationPolicy.js';

export const isOnline = writable(true);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => isOnline.set(true));
  window.addEventListener('offline', () => isOnline.set(false));
}

export async function cachedGet(path, cacheKey, ttlMs = 5 * 60 * 1000) {
  // Try network first
  try {
    const result = await api.get(path);
    cacheSet(cacheKey || path, result, ttlMs);
    isOnline.set(true);
    return result;
  } catch (err) {
    // If network fails, try cache
    const cached = cacheGet(cacheKey || path);
    if (cached) {
      isOnline.set(false);
      return cached;
    }
    throw err;
  }
}

/**
 * Custom error for mutations rejected because the device is offline
 * and the operation is not safe to defer.
 */
export class OfflineError extends Error {
  constructor(message) {
    super(message || 'You are offline. This action requires an active connection.');
    this.name = 'OfflineError';
    this.code = 'OFFLINE';
    this.offline = true;
  }
}

export async function mutationWithFallback(method, path, body) {
  try {
    const response = await fetch(`/api${path}`, {
      method: method.toUpperCase(),
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const err = new Error(data.error?.message || response.statusText);
      err.code = data.error?.code;
      err.status = response.status;
      throw err;
    }
    return await response.json();
  } catch (err) {
    if (err.status) throw err; // Server responded with error — don't queue
    // Network error — only queue if policy allows it
    if (!isQueueableMutation(method, path)) {
      throw new OfflineError(`Cannot perform ${method.toUpperCase()} ${path} offline — requires server confirmation`);
    }
    const { queueMutation } = await import('./mutationQueue.js');
    queueMutation(method.toUpperCase(), path, body);
    return { queued: true, message: 'Saved offline — will sync when connected' };
  }
}
