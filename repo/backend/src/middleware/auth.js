// Session Policy:
// - Hard max lifetime: 24 hours (expires_at in DB, cookie maxAge)
// - Inactivity timeout: 8 hours (last_activity_at checked on each request)
// - last_activity_at is refreshed on every authenticated request

import { query } from '../db/pool.js';
import { Errors } from '../utils/errors.js';
import { hashToken } from '../utils/crypto.js';

export const SESSION_TIMEOUT_HOURS = 8;

export async function authenticate(request, reply) {
  const token = request.cookies?.petmed_session;
  if (!token) {
    throw Errors.authRequired();
  }

  const tokenHash = hashToken(token);
  const result = await query(
    `SELECT s.id as session_id, s.user_id, s.expires_at, s.last_activity_at,
            u.username, u.display_name, u.status as user_status
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    throw Errors.authRequired();
  }

  const session = result.rows[0];
  if (session.user_status !== 'active') {
    throw Errors.authRequired();
  }

  const lastActivity = new Date(session.last_activity_at);
  const inactivityLimit = new Date(lastActivity.getTime() + SESSION_TIMEOUT_HOURS * 60 * 60 * 1000);
  if (new Date() > inactivityLimit) {
    await query('DELETE FROM sessions WHERE id = $1', [session.session_id]);
    throw Errors.authRequired();
  }

  await query(
    'UPDATE sessions SET last_activity_at = NOW() WHERE id = $1',
    [session.session_id]
  );

  const rolesResult = await query(
    `SELECT r.name, r.permissions FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1`,
    [session.user_id]
  );

  const scopesResult = await query(
    'SELECT scope_type, scope_id FROM user_scopes WHERE user_id = $1',
    [session.user_id]
  );

  const roles = rolesResult.rows.map(r => r.name);
  const permissions = rolesResult.rows.flatMap(r => r.permissions || []);
  const scopes = scopesResult.rows;

  request.user = {
    id: session.user_id,
    username: session.username,
    display_name: session.display_name,
    roles,
    permissions,
    scopes,
    sessionId: session.session_id,
  };
}

export function requirePermission(...requiredPerms) {
  return async (request, reply) => {
    if (!request.user) throw Errors.authRequired();
    const userPerms = request.user.permissions;
    const hasAdmin = userPerms.some(p => p === 'admin.*');
    if (hasAdmin) return;

    for (const perm of requiredPerms) {
      const hasExact = userPerms.includes(perm);
      const hasWildcard = userPerms.some(p => {
        if (p.endsWith('.*')) {
          const prefix = p.slice(0, -1);
          return perm.startsWith(prefix);
        }
        return false;
      });
      if (!hasExact && !hasWildcard) {
        throw Errors.forbidden(`Missing permission: ${perm}`);
      }
    }
  };
}

export function requireScope(scopeType, getScopeId) {
  return async (request, reply) => {
    if (!request.user) throw Errors.authRequired();

    // admin.* does NOT bypass scope restrictions.
    // A scoped user remains scoped regardless of role permissions.
    const userScopes = request.user.scopes;
    // Users with NO scope entries at all are unrestricted (not scope-limited)
    if (!userScopes || userScopes.length === 0) return;

    const relevantScopes = userScopes.filter(s => s.scope_type === scopeType);
    // User has scopes but none of this type — they are a scoped user
    // without access to this scope dimension. DEFAULT DENY.
    if (relevantScopes.length === 0) {
      throw Errors.scopeDenied();
    }

    const scopeId = typeof getScopeId === 'function' ? getScopeId(request) : request.params[getScopeId];
    // If we can't determine the scope ID, default DENY for scoped users
    if (!scopeId) {
      throw Errors.scopeDenied();
    }

    const hasScope = relevantScopes.some(s => s.scope_id === scopeId);
    if (!hasScope) {
      throw Errors.scopeDenied();
    }
  };
}

/**
 * Returns true when user has admin.* permission AND no scope entries,
 * meaning they are an unrestricted global admin.
 */
export function isGlobalAdmin(user) {
  if (!user) return false;
  const hasAdmin = user.permissions.some(p => p === 'admin.*');
  const hasScopes = user.scopes && user.scopes.length > 0;
  return hasAdmin && !hasScopes;
}

export function getScopeFilter(user, scopeType) {
  if (!user) return null;
  // admin.* does NOT bypass scope. Only truly unsoped users are unrestricted.
  if (!user.scopes || user.scopes.length === 0) return null; // truly unrestricted
  const scopes = user.scopes.filter(s => s.scope_type === scopeType);
  // User is scoped but not in this dimension — return empty array (deny all)
  if (scopes.length === 0) return [];
  return scopes.map(s => s.scope_id);
}

export async function resolveWarehouseScope(user) {
  // Direct warehouse scope — only use if user actually HAS warehouse scopes
  const warehouseScope = getScopeFilter(user, 'warehouse');
  if (warehouseScope && warehouseScope.length > 0) return warehouseScope;

  // Resolve store scope → warehouse IDs via mapping table
  const storeScope = getScopeFilter(user, 'store');
  if (storeScope && storeScope.length > 0) {
    const { query } = await import('../db/pool.js');
    const result = await query(
      'SELECT DISTINCT warehouse_id FROM store_warehouses WHERE store_id = ANY($1)',
      [storeScope]
    );
    if (result.rows.length > 0) {
      return result.rows.map(r => r.warehouse_id);
    }
    return []; // store scoped but no warehouse mapping = deny
  }

  // User has scopes (warehouseScope is []) but no warehouse or store scopes → deny
  if (warehouseScope !== null || storeScope !== null) return [];

  return null; // truly unrestricted
}
