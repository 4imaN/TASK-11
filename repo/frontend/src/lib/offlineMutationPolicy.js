/**
 * Pure classification of which mutations may be deferred to an offline queue.
 *
 * Kept in its own module so it can be imported without pulling in Svelte
 * stores, browser event listeners, or the fetch-based API client.
 */

const NON_QUEUEABLE_PATTERNS = [
  // Constrained holds — require real-time slot locking
  /^POST \/holds$/,
  /^DELETE \/holds\//,
  /^POST \/holds\/.+\/checkout$/,

  // Cart checkout — requires drift/price recheck
  /^POST \/cart\/checkout$/,

  // Task accept & status — optimistic concurrency, version-locked
  /^POST \/tasks\/.+\/accept$/,
  /^PATCH \/tasks\/.+\/status$/,
  /^POST \/tasks\/.+\/assign$/,

  // Evidence upload — binary, not JSON-serializable for queue
  /^POST \/outcomes\/.+\/evidence$/,

  // Auth — session state, not replayable
  /^POST \/auth\//,
];

/**
 * Returns true when the given mutation is safe to store for later replay.
 * @param {string} method  HTTP verb (case-insensitive)
 * @param {string} path    Route path, e.g. "/holds" or "/tasks/uuid/accept"
 */
export function isQueueableMutation(method, path) {
  const key = `${method.toUpperCase()} ${path}`;
  return !NON_QUEUEABLE_PATTERNS.some((re) => re.test(key));
}
