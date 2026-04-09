import { writable, derived } from 'svelte/store';
import { api } from '$lib/api.js';
import { setQueueUser, clearUserQueue } from '$lib/mutationQueue.js';

export const user = writable(null);
export const loading = writable(true);

export const isAuthenticated = derived(user, ($user) => !!$user);
export const userRoles = derived(user, ($user) => $user?.roles || []);
export const userPermissions = derived(user, ($user) => $user?.permissions || []);

export function hasPermission(perms, requiredPerm) {
  if (perms.some(p => p === 'admin.*')) return true;
  if (perms.includes(requiredPerm)) return true;
  return perms.some(p => {
    if (p.endsWith('.*')) {
      return requiredPerm.startsWith(p.slice(0, -1));
    }
    return false;
  });
}

export function hasRole(roles, role) {
  return roles.includes(role);
}

export async function checkAuth() {
  try {
    loading.set(true);
    const data = await api.get('/auth/me');
    user.set(data.data.user);
    if (data.data.user) {
      setQueueUser(data.data.user.id);
    }
  } catch {
    user.set(null);
  } finally {
    loading.set(false);
  }
}

export async function login(username, password) {
  const data = await api.post('/auth/login', { username, password });
  user.set(data.data.user);
  setQueueUser(data.data.user.id);
  return data;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    let currentUser;
    user.subscribe(u => currentUser = u)();
    clearUserQueue();
    user.set(null);
  }
}
