import { authenticate, requirePermission, getScopeFilter } from '../middleware/auth.js';
import { query } from '../db/pool.js';

export default async function configRoutes(fastify) {
  fastify.get('/api/config', {
    preHandler: [authenticate, requirePermission('config.*')],
  }, async () => {
    const result = await query('SELECT key, value, description, updated_at FROM system_config ORDER BY key');
    return { success: true, data: result.rows };
  });

  fastify.put('/api/config/:key', {
    preHandler: [authenticate, requirePermission('config.*')],
    schema: {
      body: {
        type: 'object',
        required: ['value'],
      },
    },
  }, async (request, reply) => {
    const result = await query(
      'UPDATE system_config SET value = $1, updated_at = NOW() WHERE key = $2 RETURNING *',
      [JSON.stringify(request.body.value), request.params.key]
    );
    if (result.rows.length === 0) {
      reply.code(404);
      return { success: false, error: { code: 'NOT_FOUND', message: 'Config key not found' } };
    }
    return { success: true, data: result.rows[0] };
  });

  // Audit logs
  fastify.get('/api/audit-logs', {
    preHandler: [authenticate, requirePermission('audit.*')],
  }, async (request) => {
    let sql = `SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id`;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (request.query.user_id) { conditions.push(`al.user_id = $${idx++}`); params.push(request.query.user_id); }
    if (request.query.action) { conditions.push(`al.action = $${idx++}`); params.push(request.query.action); }
    if (request.query.entity_type) { conditions.push(`al.entity_type = $${idx++}`); params.push(request.query.entity_type); }
    if (request.query.from) { conditions.push(`al.created_at >= $${idx++}`); params.push(request.query.from); }
    if (request.query.to) { conditions.push(`al.created_at <= $${idx++}`); params.push(request.query.to); }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY al.created_at DESC';

    const page = parseInt(request.query.page) || 1;
    const limit = parseInt(request.query.limit) || 50;
    sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, (page - 1) * limit);

    const result = await query(sql, params);
    return { success: true, data: result.rows };
  });

  // Stores and Departments (reference data) — scoped
  fastify.get('/api/stores', { preHandler: [authenticate, requirePermission('catalog.read')] }, async (request) => {
    const storeScope = getScopeFilter(request.user, 'store');
    if (Array.isArray(storeScope) && storeScope.length === 0) {
      return { success: true, data: [] };
    }
    let sql = 'SELECT * FROM stores';
    const params = [];
    if (storeScope && storeScope.length > 0) {
      sql += ' WHERE id = ANY($1)';
      params.push(storeScope);
    }
    sql += ' ORDER BY name';
    const result = await query(sql, params);
    return { success: true, data: result.rows };
  });

  fastify.get('/api/departments', { preHandler: [authenticate, requirePermission('outcomes.*')] }, async (request) => {
    const deptScope = getScopeFilter(request.user, 'department');
    if (Array.isArray(deptScope) && deptScope.length === 0) {
      return { success: true, data: [] };
    }
    let sql = 'SELECT * FROM departments';
    const params = [];
    if (deptScope && deptScope.length > 0) {
      sql += ' WHERE id = ANY($1)';
      params.push(deptScope);
    }
    sql += ' ORDER BY name';
    const result = await query(sql, params);
    return { success: true, data: result.rows };
  });
}
