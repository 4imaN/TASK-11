import { authenticate, requirePermission, resolveWarehouseScope } from '../middleware/auth.js';
import * as inventoryService from '../services/inventory.js';
import { Errors } from '../utils/errors.js';

export default async function inventoryRoutes(fastify) {
  fastify.get('/api/inventory', {
    preHandler: [authenticate, requirePermission('inventory.read')],
  }, async (request) => {
    const warehouseScope = await resolveWarehouseScope(request.user);
    const filters = { ...request.query };
    if (warehouseScope) {
      filters.warehouse_ids = warehouseScope;
    }
    const items = await inventoryService.listInventory(filters);
    return { success: true, data: items };
  });

  fastify.post('/api/inventory', {
    preHandler: [authenticate, requirePermission('inventory.*')],
    schema: {
      body: {
        type: 'object',
        required: ['sku_id', 'warehouse_id', 'available_qty'],
        properties: {
          sku_id: { type: 'string' },
          warehouse_id: { type: 'string' },
          lot_number: { type: 'string' },
          available_qty: { type: 'integer', minimum: 0 },
          threshold_warning: { type: 'integer', minimum: 0 },
          threshold_critical: { type: 'integer', minimum: 0 },
        },
      },
    },
  }, async (request) => {
    // Enforce resolved warehouse scope (direct warehouse + store→warehouse mapping)
    const warehouseScope = await resolveWarehouseScope(request.user);
    if (warehouseScope && !warehouseScope.includes(request.body.warehouse_id)) {
      throw Errors.scopeDenied();
    }
    const inv = await inventoryService.createOrUpdateInventory(request.body);
    return { success: true, data: inv };
  });

  fastify.put('/api/inventory/:id', {
    preHandler: [authenticate, requirePermission('inventory.*')],
  }, async (request) => {
    // Enforce resolved warehouse scope (direct warehouse + store→warehouse mapping)
    const existing = await inventoryService.getInventoryById(request.params.id);
    const warehouseScope = await resolveWarehouseScope(request.user);
    if (warehouseScope && existing && !warehouseScope.includes(existing.warehouse_id)) {
      throw Errors.scopeDenied();
    }
    const inv = await inventoryService.updateInventory(request.params.id, request.body);
    return { success: true, data: inv };
  });

  fastify.get('/api/warehouses', {
    preHandler: [authenticate, requirePermission('inventory.read')],
  }, async (request) => {
    const warehouseScope = await resolveWarehouseScope(request.user);
    if (Array.isArray(warehouseScope) && warehouseScope.length === 0) {
      return { success: true, data: [] };
    }
    const warehouses = await inventoryService.listWarehouses(warehouseScope);
    return { success: true, data: warehouses };
  });

  fastify.post('/api/warehouses', {
    preHandler: [authenticate, requirePermission('admin.*')],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'code'],
        properties: {
          name: { type: 'string' },
          code: { type: 'string' },
          address: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const warehouse = await inventoryService.createWarehouse(request.body);
    reply.code(201);
    return { success: true, data: warehouse };
  });
}
