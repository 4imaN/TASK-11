import { authenticate, requirePermission } from '../middleware/auth.js';
import * as supplierService from '../services/supplier.js';

export default async function supplierRoutes(fastify) {
  fastify.get('/api/suppliers', { preHandler: [authenticate, requirePermission('catalog.read')] }, async (request) => {
    const suppliers = await supplierService.listSuppliers(request.query);
    return { success: true, data: suppliers };
  });

  fastify.post('/api/suppliers', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          contact_info: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const supplier = await supplierService.createSupplier(request.body);
    reply.code(201);
    return { success: true, data: supplier };
  });

  fastify.put('/api/suppliers/:id', {
    preHandler: [authenticate, requirePermission('catalog.*')],
  }, async (request) => {
    const supplier = await supplierService.updateSupplier(request.params.id, request.body);
    return { success: true, data: supplier };
  });

  fastify.patch('/api/suppliers/:id/status', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['active', 'archived'] },
        },
      },
    },
  }, async (request) => {
    const supplier = await supplierService.updateSupplierStatus(request.params.id, request.body.status);
    return { success: true, data: supplier };
  });

  // List all SKU pricing entries for a given supplier
  fastify.get('/api/suppliers/:id/skus', { preHandler: [authenticate, requirePermission('catalog.read')] }, async (request) => {
    const pricing = await supplierService.listSupplierSKUs(request.params.id);
    return { success: true, data: pricing };
  });

  // SKU-Supplier Pricing
  fastify.get('/api/skus/:skuId/suppliers', { preHandler: [authenticate, requirePermission('catalog.read')] }, async (request) => {
    const pricing = await supplierService.listSKUSuppliers(request.params.skuId);
    return { success: true, data: pricing };
  });

  fastify.post('/api/skus/:skuId/suppliers', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['supplier_id', 'unit_price', 'moq', 'pack_size'],
        properties: {
          supplier_id: { type: 'string' },
          unit_price: { type: 'number', exclusiveMinimum: 0 },
          moq: { type: 'integer', minimum: 1 },
          pack_size: { type: 'integer', minimum: 1 },
          is_preferred: { type: 'boolean' },
          is_active: { type: 'boolean' },
          lead_time_days: { type: 'integer' },
          is_taxable: { type: 'boolean' },
        },
      },
    },
  }, async (request) => {
    const pricing = await supplierService.upsertSKUSupplier(request.params.skuId, request.body);
    return { success: true, data: pricing };
  });

  fastify.put('/api/sku-suppliers/:id', {
    preHandler: [authenticate, requirePermission('catalog.*')],
  }, async (request) => {
    const pricing = await supplierService.updateSKUSupplier(request.params.id, request.body);
    return { success: true, data: pricing };
  });

  fastify.delete('/api/sku-suppliers/:id', {
    preHandler: [authenticate, requirePermission('catalog.*')],
  }, async (request) => {
    const pricing = await supplierService.deactivateSKUSupplier(request.params.id);
    return { success: true, data: pricing };
  });
}
