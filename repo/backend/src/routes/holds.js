import { authenticate, requirePermission, getScopeFilter, resolveWarehouseScope } from '../middleware/auth.js';
import { Errors } from '../utils/errors.js';
import { query } from '../db/pool.js';
import * as holdsService from '../services/holds.js';

export default async function holdsRoutes(fastify) {
  fastify.get('/api/constrained-slots', {
    preHandler: [authenticate, requirePermission('inventory.read')],
  }, async (request, reply) => {
    if (!request.query.inventory_id) {
      reply.code(400);
      return { success: false, error: { code: 'VALIDATION', message: 'inventory_id is required' } };
    }
    // Warehouse scope check
    const warehouseFilter = await resolveWarehouseScope(request.user);
    if (warehouseFilter) {
      const invResult = await query('SELECT warehouse_id FROM inventory WHERE id = $1', [request.query.inventory_id]);
      if (invResult.rows.length === 0) {
        throw Errors.notFound('Inventory');
      }
      if (!warehouseFilter.includes(invResult.rows[0].warehouse_id)) {
        throw Errors.scopeDenied();
      }
    }
    const slots = await holdsService.listSlots(request.query.inventory_id);
    return { success: true, data: slots };
  });

  fastify.post('/api/holds', {
    preHandler: [authenticate, requirePermission('hold.*')],
    schema: {
      body: {
        type: 'object',
        required: ['slot_ids', 'client_request_key'],
        properties: {
          slot_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
          client_request_key: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request) => {
    // Enforce warehouse scope on slot access before creating hold
    const warehouseFilter = await resolveWarehouseScope(request.user);
    if (warehouseFilter && request.body.slot_ids.length > 0) {
      const slotCheck = await query(
        `SELECT DISTINCT i.warehouse_id FROM constrained_slots cs
         JOIN inventory i ON i.id = cs.inventory_id
         WHERE cs.id = ANY($1)`,
        [request.body.slot_ids]
      );
      for (const row of slotCheck.rows) {
        if (!warehouseFilter.includes(row.warehouse_id)) {
          throw Errors.scopeDenied();
        }
      }
    }
    const result = await holdsService.createHold(
      request.user.id, request.body.slot_ids, request.body.client_request_key
    );
    return { success: true, data: result };
  });

  fastify.get('/api/holds/:id', {
    preHandler: [authenticate],
  }, async (request) => {
    const result = await holdsService.getHold(request.params.id, request.user);
    return { success: true, data: result };
  });

  fastify.delete('/api/holds/:id', {
    preHandler: [authenticate, requirePermission('hold.*')],
  }, async (request) => {
    await holdsService.cancelHold(request.params.id, request.user.id);
    return { success: true, data: null };
  });

  fastify.post('/api/holds/:id/checkout', {
    preHandler: [authenticate, requirePermission('hold.*')],
    schema: {
      body: {
        type: 'object',
        required: ['idempotency_key'],
        properties: {
          idempotency_key: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request) => {
    const result = await holdsService.commitHold(
      request.params.id, request.user.id, request.body.idempotency_key, request.user
    );
    return { success: true, data: result };
  });
}
