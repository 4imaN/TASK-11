import { authenticate, requirePermission } from '../middleware/auth.js';
import { Errors } from '../utils/errors.js';
import * as catalogService from '../services/catalog.js';

export default async function catalogRoutes(fastify) {
  // Categories
  fastify.get('/api/categories', { preHandler: [authenticate, requirePermission('catalog.read')] }, async (request) => {
    const flat = request.query.flat === 'true';
    const categories = await catalogService.listCategories(flat);
    return { success: true, data: categories };
  });

  fastify.post('/api/categories', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          parent_id: { type: 'string' },
          sort_order: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const category = await catalogService.createCategory(request.body);
    reply.code(201);
    return { success: true, data: category };
  });

  fastify.put('/api/categories/:id', {
    preHandler: [authenticate, requirePermission('catalog.*')],
  }, async (request) => {
    const category = await catalogService.updateCategory(request.params.id, request.body);
    return { success: true, data: category };
  });

  // Tags
  fastify.get('/api/tags', { preHandler: [authenticate, requirePermission('catalog.read')] }, async (request) => {
    const tags = await catalogService.listTags(request.query.search);
    return { success: true, data: tags };
  });

  fastify.post('/api/tags', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request, reply) => {
    const tag = await catalogService.createTag(request.body);
    reply.code(201);
    return { success: true, data: tag };
  });

  // SPUs
  fastify.get('/api/spus', { preHandler: [authenticate, requirePermission('catalog.read')] }, async (request) => {
    const filters = { ...request.query };
    const isAdmin = request.user.permissions.some(p => p === 'admin.*');
    const isBuyer = request.user.roles.includes('buyer');
    if (isBuyer && !isAdmin) {
      filters.published_only = true;
    }
    const result = await catalogService.listSPUs(filters);
    return { success: true, data: result };
  });

  fastify.get('/api/spus/:id', { preHandler: [authenticate, requirePermission('catalog.read')] }, async (request) => {
    // Buyers can only see published SPUs
    const isAdmin = request.user.permissions.some(p => p === 'admin.*' || p === 'catalog.*');
    const spu = await catalogService.getSPU(request.params.id, !isAdmin);
    if (!isAdmin && spu.status !== 'published') {
      throw Errors.notFound('SPU');
    }
    return { success: true, data: spu };
  });

  fastify.post('/api/spus', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          category_id: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          images: { type: 'array' },
          spec_attributes: { type: 'array' },
        },
      },
    },
  }, async (request, reply) => {
    const spu = await catalogService.createSPU(request.body, request.user.id);
    reply.code(201);
    return { success: true, data: spu };
  });

  fastify.put('/api/spus/:id', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          category_id: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          images: {
            type: 'array',
            items: {
              type: 'object',
              required: ['image_url'],
              properties: {
                image_url: { type: 'string', minLength: 1 },
                sort_order: { type: 'integer', minimum: 0 },
                is_primary: { type: 'boolean' },
              },
            },
          },
          spec_attributes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'values'],
              properties: {
                name: { type: 'string', minLength: 1 },
                values: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const spu = await catalogService.updateSPU(request.params.id, request.body, request.user.id);
    return { success: true, data: spu };
  });

  fastify.patch('/api/spus/:id/status', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['published', 'unpublished', 'archived'] },
        },
      },
    },
  }, async (request) => {
    const spu = await catalogService.updateSPUStatus(request.params.id, request.body.status, request.user.id);
    return { success: true, data: spu };
  });

  // SKUs
  fastify.get('/api/spus/:spuId/skus', { preHandler: [authenticate, requirePermission('catalog.read')] }, async (request) => {
    // Buyers can only access SKUs for published SPUs
    const isAdmin = request.user.permissions.some(p => p === 'admin.*' || p === 'catalog.*');
    if (!isAdmin) {
      const spu = await catalogService.getSPU(request.params.spuId);
      if (spu.status !== 'published') {
        throw Errors.notFound('SPU');
      }
    }
    const skus = await catalogService.listSKUs(request.params.spuId, !isAdmin);
    return { success: true, data: skus };
  });

  fastify.post('/api/spus/:spuId/skus', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['sku_code'],
        properties: {
          sku_code: { type: 'string', minLength: 1 },
          spec_combination: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const sku = await catalogService.createSKU(request.params.spuId, request.body);
    reply.code(201);
    return { success: true, data: sku };
  });

  fastify.put('/api/skus/:id', {
    preHandler: [authenticate, requirePermission('catalog.*')],
  }, async (request) => {
    const sku = await catalogService.updateSKU(request.params.id, request.body);
    return { success: true, data: sku };
  });

  fastify.patch('/api/skus/:id/status', {
    preHandler: [authenticate, requirePermission('catalog.*')],
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['draft', 'published', 'unpublished', 'archived'] },
        },
      },
    },
  }, async (request) => {
    const sku = await catalogService.updateSKUStatus(request.params.id, request.body.status);
    return { success: true, data: sku };
  });
}
