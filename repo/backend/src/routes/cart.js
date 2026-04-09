import { authenticate, requirePermission, getScopeFilter, resolveWarehouseScope } from '../middleware/auth.js';
import { Errors } from '../utils/errors.js';
import * as cartService from '../services/cart.js';
import { createTasksForOrder } from '../services/tasks.js';
import { logAudit } from '../utils/audit.js';
import { logger } from '../utils/logger.js';

export default async function cartRoutes(fastify) {
  fastify.get('/api/cart', {
    preHandler: [authenticate, requirePermission('cart.*')],
  }, async (request) => {
    const storeScope = getScopeFilter(request.user, 'store');
    const cart = await cartService.getCart(request.user.id, storeScope);
    return { success: true, data: cart };
  });

  fastify.post('/api/cart/items', {
    preHandler: [authenticate, requirePermission('cart.*')],
    schema: {
      body: {
        type: 'object',
        required: ['sku_id', 'quantity'],
        properties: {
          sku_id: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
          supplier_id: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const storeScope = getScopeFilter(request.user, 'store');
    // Hard deny for scoped users without store scope
    if (Array.isArray(storeScope) && storeScope.length === 0) {
      throw Errors.scopeDenied();
    }
    const storeId = storeScope && storeScope.length > 0 ? storeScope[0] : null;
    const cart = await cartService.addCartItem(request.user.id, storeId, request.body, storeScope);
    return { success: true, data: cart };
  });

  fastify.put('/api/cart/items/:id', {
    preHandler: [authenticate, requirePermission('cart.*')],
    schema: {
      body: {
        type: 'object',
        required: ['quantity'],
        properties: {
          quantity: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, async (request) => {
    const storeScope = getScopeFilter(request.user, 'store');
    const cart = await cartService.updateCartItem(request.user.id, request.params.id, request.body, storeScope);
    return { success: true, data: cart };
  });

  fastify.delete('/api/cart/items/:id', {
    preHandler: [authenticate, requirePermission('cart.*')],
  }, async (request) => {
    const storeScope = getScopeFilter(request.user, 'store');
    const cart = await cartService.removeCartItem(request.user.id, request.params.id, storeScope);
    return { success: true, data: cart };
  });

  fastify.post('/api/cart/estimate', {
    preHandler: [authenticate, requirePermission('cart.*')],
  }, async (request) => {
    const storeScope = getScopeFilter(request.user, 'store');
    const warehouseScope = await resolveWarehouseScope(request.user);
    const estimate = await cartService.estimateCart(request.user.id, storeScope, warehouseScope);
    return { success: true, data: estimate };
  });

  fastify.post('/api/cart/checkout', {
    preHandler: [authenticate, requirePermission('order.create')],
    schema: {
      body: {
        type: 'object',
        required: ['idempotency_key', 'estimate_id'],
        properties: {
          estimate_id: { type: 'string', minLength: 1 },
          idempotency_key: { type: 'string', minLength: 1 },
          confirmed_drift: { type: 'boolean' },
        },
      },
    },
  }, async (request) => {
    const storeScope = getScopeFilter(request.user, 'store');
    const warehouseScope = await resolveWarehouseScope(request.user);
    const order = await cartService.checkout(request.user.id, request.body, storeScope, warehouseScope);
    try {
      await createTasksForOrder(order.id);
    } catch (e) {
      logger.error('cart', 'Failed to create tasks for order', { error: e.message, orderId: order.id });
      await logAudit(request.user.id, 'task_creation_failed', 'order', order.id, { error: e.message }, null).catch(() => {});
    }
    return { success: true, data: order };
  });
}
