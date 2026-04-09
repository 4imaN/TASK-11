import bcrypt from 'bcryptjs';
import { query, transaction } from '../db/pool.js';
import { generateToken, hashToken } from '../utils/crypto.js';
import { Errors } from '../utils/errors.js';
import { logAudit } from '../utils/audit.js';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const SESSION_DURATION_HOURS = 24;
const BCRYPT_ROUNDS = 12;

export async function login(username, password, ipAddress) {
  const userResult = await query(
    'SELECT id, username, password_hash, display_name, status, failed_login_count, locked_until, last_failed_at FROM users WHERE username = $1',
    [username]
  );

  if (userResult.rows.length === 0) {
    await logAudit(null, 'login_failed', 'user', null, { username, reason: 'user_not_found' }, ipAddress);
    throw Errors.authInvalid();
  }

  const user = userResult.rows[0];

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await logAudit(user.id, 'login_locked', 'user', user.id, { username }, ipAddress);
    throw Errors.authLocked(user.locked_until);
  }

  // Reset failed count if lockout has expired
  if (user.locked_until && new Date(user.locked_until) <= new Date() && user.failed_login_count >= LOCKOUT_THRESHOLD) {
    await query(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );
    user.failed_login_count = 0;
    user.locked_until = null;
  }

  if (user.status !== 'active') {
    throw Errors.authInvalid();
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    // Rolling 15-minute window: reset count to 1 if last failure was more than 15 minutes ago
    const now = new Date();
    let baseCount = user.failed_login_count;
    if (user.last_failed_at) {
      const lastFailed = new Date(user.last_failed_at);
      const windowMs = LOCKOUT_WINDOW_MINUTES * 60 * 1000;
      if (now.getTime() - lastFailed.getTime() > windowMs) {
        baseCount = 0; // reset — outside rolling window
      }
    }

    const newCount = baseCount + 1;
    let lockedUntil = null;

    if (newCount >= LOCKOUT_THRESHOLD) {
      lockedUntil = new Date(Date.now() + LOCKOUT_WINDOW_MINUTES * 60 * 1000);
      await query(
        'UPDATE users SET failed_login_count = $1, locked_until = $2, last_failed_at = NOW() WHERE id = $3',
        [newCount, lockedUntil, user.id]
      );
      await logAudit(user.id, 'account_locked', 'user', user.id, { attempts: newCount }, ipAddress);
      throw Errors.authLocked(lockedUntil);
    }

    await query(
      'UPDATE users SET failed_login_count = $1, last_failed_at = NOW() WHERE id = $2',
      [newCount, user.id]
    );
    await logAudit(user.id, 'login_failed', 'user', user.id, { attempts: newCount }, ipAddress);
    throw Errors.authInvalid();
  }

  await query(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_failed_at = NULL WHERE id = $1',
    [user.id]
  );

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [user.id, tokenHash, expiresAt, ipAddress]
  );

  const rolesResult = await query(
    `SELECT r.name, r.permissions FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
    [user.id]
  );

  const scopesResult = await query(
    'SELECT scope_type, scope_id FROM user_scopes WHERE user_id = $1',
    [user.id]
  );

  await logAudit(user.id, 'login_success', 'user', user.id, {}, ipAddress);

  return {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      roles: rolesResult.rows.map(r => r.name),
      permissions: rolesResult.rows.flatMap(r => r.permissions || []),
      scopes: scopesResult.rows,
    },
    token,
  };
}

export async function logout(sessionId) {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

export async function createUser(data, callingUserId = null) {
  const { username, password, display_name, email, roles, scopes } = data;

  const existing = await query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    throw Errors.duplicate('Username already exists');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await transaction(async (client) => {
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, display_name, email)
       VALUES ($1, $2, $3, $4) RETURNING id, username, display_name, email, status`,
      [username, passwordHash, display_name, email]
    );
    const user = userResult.rows[0];

    if (roles && roles.length > 0) {
      for (const roleName of roles) {
        const roleResult = await client.query('SELECT id FROM roles WHERE name = $1', [roleName]);
        if (roleResult.rows.length > 0) {
          await client.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
            [user.id, roleResult.rows[0].id]
          );
        }
      }
    }

    if (scopes && scopes.length > 0) {
      for (const scope of scopes) {
        const scopeId = scope.id || scope.ref_id;
        if (!scopeId) continue;

        // Validate scope target exists
        const tableMap = { warehouse: 'warehouses', store: 'stores', department: 'departments' };
        const table = tableMap[scope.type];
        if (!table) {
          throw Errors.validation(`Invalid scope type: ${scope.type}`);
        }
        const exists = await client.query(`SELECT id FROM ${table} WHERE id = $1`, [scopeId]);
        if (exists.rows.length === 0) {
          throw Errors.validation(`${scope.type} with ID ${scopeId} does not exist`);
        }

        await client.query(
          'INSERT INTO user_scopes (user_id, scope_type, scope_id) VALUES ($1, $2, $3)',
          [user.id, scope.type, scopeId]
        );
      }
    }

    return user;
  });

  await logAudit(callingUserId, 'user_created', 'user', user.id, { username, display_name, roles, scopes }, null);

  return user;
}

export async function listUsers(filters = {}) {
  let sql = `
    SELECT u.id, u.username, u.display_name, u.email, u.status, u.created_at,
           array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) as roles
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
  `;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`u.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.role) {
    conditions.push(`r.name = $${idx++}`);
    params.push(filters.role);
  }
  if (filters.search) {
    conditions.push(`(u.username ILIKE $${idx} OR u.display_name ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' GROUP BY u.id ORDER BY u.created_at DESC';

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, (page - 1) * limit);

  const result = await query(sql, params);
  const users = result.rows;

  // Fetch scopes for each user and attach them
  if (users.length > 0) {
    const userIds = users.map(u => u.id);
    const scopesResult = await query(
      'SELECT user_id, scope_type, scope_id FROM user_scopes WHERE user_id = ANY($1)',
      [userIds]
    );
    const scopesByUser = {};
    for (const scope of scopesResult.rows) {
      if (!scopesByUser[scope.user_id]) {
        scopesByUser[scope.user_id] = [];
      }
      scopesByUser[scope.user_id].push({ scope_type: scope.scope_type, scope_id: scope.scope_id });
    }
    for (const user of users) {
      user.scopes = scopesByUser[user.id] || [];
    }
  }

  return users;
}

export async function updateUser(userId, data, callingUserId = null) {
  const { display_name, email, status, roles, scopes } = data;

  const updatedUser = await transaction(async (client) => {
    if (display_name || email || status) {
      const updates = [];
      const params = [];
      let idx = 1;
      if (display_name) { updates.push(`display_name = $${idx++}`); params.push(display_name); }
      if (email) { updates.push(`email = $${idx++}`); params.push(email); }
      if (status) { updates.push(`status = $${idx++}`); params.push(status); }
      updates.push(`updated_at = NOW()`);
      params.push(userId);
      await client.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
        params
      );
    }

    if (roles) {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      for (const roleName of roles) {
        const roleResult = await client.query('SELECT id FROM roles WHERE name = $1', [roleName]);
        if (roleResult.rows.length > 0) {
          await client.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
            [userId, roleResult.rows[0].id]
          );
        }
      }
    }

    if (scopes) {
      await client.query('DELETE FROM user_scopes WHERE user_id = $1', [userId]);
      for (const scope of scopes) {
        const scopeId = scope.id || scope.ref_id;
        if (!scopeId) continue;

        // Validate scope target exists
        const tableMap = { warehouse: 'warehouses', store: 'stores', department: 'departments' };
        const table = tableMap[scope.type];
        if (!table) {
          throw Errors.validation(`Invalid scope type: ${scope.type}`);
        }
        const exists = await client.query(`SELECT id FROM ${table} WHERE id = $1`, [scopeId]);
        if (exists.rows.length === 0) {
          throw Errors.validation(`${scope.type} with ID ${scopeId} does not exist`);
        }

        await client.query(
          'INSERT INTO user_scopes (user_id, scope_type, scope_id) VALUES ($1, $2, $3)',
          [userId, scope.type, scopeId]
        );
      }
    }

    const result = await client.query(
      'SELECT id, username, display_name, email, status FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  });

  await logAudit(callingUserId, 'user_updated', 'user', userId, { display_name, email, status, roles, scopes }, null);

  return updatedUser;
}

export async function getRoles() {
  const result = await query('SELECT id, name, description, permissions FROM roles ORDER BY name');
  return result.rows;
}
