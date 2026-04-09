import { writable, get } from 'svelte/store';
import { isQueueableMutation } from './offlineMutationPolicy.js';

let currentUserId = null;

function getQueueKey() {
  return currentUserId ? `petmed_mutation_queue_${currentUserId}` : null;
}

export const pendingMutations = writable(0);

function loadQueue() {
  const key = getQueueKey();
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function saveQueue(queue) {
  const key = getQueueKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(queue));
  pendingMutations.set(queue.length);
}

export function setQueueUser(userId) {
  currentUserId = userId;
  if (userId) {
    pendingMutations.set(loadQueue().length);
  }
}

export function clearUserQueue() {
  const key = getQueueKey();
  if (key) localStorage.removeItem(key);
  currentUserId = null;
  pendingMutations.set(0);
}

export function queueMutation(method, path, body) {
  if (!currentUserId) {
    throw new Error('Cannot queue mutations: no user session');
  }
  if (!isQueueableMutation(method, path)) {
    throw new Error(`Cannot queue offline: ${method} ${path} requires backend confirmation`);
  }
  const queue = loadQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    method, path, body,
    createdAt: new Date().toISOString(),
  });
  saveQueue(queue);
}

export async function flushMutationQueue() {
  const queue = loadQueue();
  if (queue.length === 0) return { flushed: 0, failed: 0 };

  let flushed = 0;
  let failed = 0;
  const remaining = [];

  for (const entry of queue) {
    try {
      const response = await fetch(`/api${entry.path}`, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: entry.body ? JSON.stringify(entry.body) : undefined,
      });
      if (response.ok) {
        flushed++;
      } else if (response.status === 409) {
        const data = await response.json().catch(() => ({}));
        if (data.error?.code === 'DUPLICATE') {
          flushed++; // Idempotent duplicate — already applied
        } else {
          failed++;
          remaining.push(entry);
        }
      } else {
        failed++;
        remaining.push(entry);
      }
    } catch {
      failed++;
      remaining.push(entry);
    }
  }

  saveQueue(remaining);
  return { flushed, failed };
}

// Auto-flush when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const q = loadQueue();
    if (q.length > 0) flushMutationQueue();
  });
}
