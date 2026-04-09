const CACHE_PREFIX = 'petmed_cache_';
const DRAFT_PREFIX = 'petmed_draft_';

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (expiry && Date.now() > expiry) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return data;
  } catch { return null; }
}

export function cacheSet(key, data, ttlMs = 5 * 60 * 1000) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      data,
      expiry: Date.now() + ttlMs,
    }));
  } catch {}
}

export function cacheClear(key) {
  localStorage.removeItem(CACHE_PREFIX + key);
}

export function draftGet(key) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function draftSet(key, data) {
  try {
    localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(data));
  } catch {}
}

export function draftClear(key) {
  localStorage.removeItem(DRAFT_PREFIX + key);
}
