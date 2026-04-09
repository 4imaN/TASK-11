import { authenticate, requirePermission, resolveWarehouseScope } from '../middleware/auth.js';
import { Errors } from '../utils/errors.js';
import * as tasksService from '../services/tasks.js';

function hasAdminPermission(user) {
  return user.permissions.some(p => p === 'admin.*');
}

// Non-admin users may only use these modes. Any other value is normalized to the default.
const ALLOWED_NON_ADMIN_MODES = new Set(['grab', 'assigned', 'own_and_grab']);
const DEFAULT_NON_ADMIN_MODE = 'own_and_grab';

export default async function taskRoutes(fastify) {
  fastify.get('/api/tasks', {
    preHandler: [authenticate, requirePermission('task.*')],
  }, async (request) => {
    const warehouseScope = await resolveWarehouseScope(request.user);
    const isAdmin = hasAdminPermission(request.user);
    const filters = {
      ...request.query,
      user_id: request.user.id,
    };
    if (warehouseScope) {
      filters.warehouse_ids = warehouseScope;
    }
    // Non-admin users are restricted to the allowlisted modes.
    // Missing or unrecognized values are normalized to the restrictive default.
    if (!isAdmin && !ALLOWED_NON_ADMIN_MODES.has(filters.mode)) {
      filters.mode = DEFAULT_NON_ADMIN_MODE;
    }
    const tasks = await tasksService.listTasks(filters);
    return { success: true, data: tasks };
  });

  fastify.get('/api/tasks/recommendations', {
    preHandler: [authenticate, requirePermission('task.*')],
  }, async (request) => {
    const warehouseScope = await resolveWarehouseScope(request.user);
    const tasks = await tasksService.getRecommendations(
      request.user.id, warehouseScope
    );
    return { success: true, data: tasks };
  });

  fastify.get('/api/tasks/:id', {
    preHandler: [authenticate, requirePermission('task.*')],
  }, async (request) => {
    const task = await tasksService.getTask(request.params.id);
    const warehouseScope = await resolveWarehouseScope(request.user);
    if (warehouseScope && task.warehouse_id && !warehouseScope.includes(task.warehouse_id)) {
      throw Errors.scopeDenied();
    }
    // Non-admin users can only view tasks assigned to them or open/unassigned
    if (!hasAdminPermission(request.user)) {
      const isOwnTask = task.assigned_user_id === request.user.id;
      const isGrabbable = !task.assigned_user_id && task.status === 'open';
      if (!isOwnTask && !isGrabbable) {
        throw Errors.scopeDenied();
      }
    }
    return { success: true, data: task };
  });

  fastify.post('/api/tasks/:id/accept', {
    preHandler: [authenticate, requirePermission('task.*')],
    schema: {
      body: {
        type: 'object',
        required: ['version'],
        properties: {
          version: { type: 'integer' },
        },
      },
    },
  }, async (request) => {
    const existing = await tasksService.getTask(request.params.id);
    const warehouseScope = await resolveWarehouseScope(request.user);
    if (warehouseScope && existing.warehouse_id && !warehouseScope.includes(existing.warehouse_id)) {
      throw Errors.scopeDenied();
    }
    const task = await tasksService.acceptTask(
      request.params.id, request.user.id, request.body.version
    );
    return { success: true, data: task };
  });

  fastify.post('/api/tasks/:id/assign', {
    preHandler: [authenticate, requirePermission('admin.*')],
    schema: {
      body: {
        type: 'object',
        required: ['user_id'],
        properties: {
          user_id: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const existing = await tasksService.getTask(request.params.id);
    const warehouseScope = await resolveWarehouseScope(request.user);
    if (warehouseScope && existing.warehouse_id && !warehouseScope.includes(existing.warehouse_id)) {
      throw Errors.scopeDenied();
    }
    const task = await tasksService.assignTask(request.params.id, request.body.user_id);
    return { success: true, data: task };
  });

  fastify.patch('/api/tasks/:id/status', {
    preHandler: [authenticate, requirePermission('task.*')],
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['in_progress', 'completed', 'failed', 'cancelled'] },
        },
      },
    },
  }, async (request) => {
    const existing = await tasksService.getTask(request.params.id);
    const warehouseScope = await resolveWarehouseScope(request.user);
    if (warehouseScope && existing.warehouse_id && !warehouseScope.includes(existing.warehouse_id)) {
      throw Errors.scopeDenied();
    }
    // Only the assigned user or an admin can change task status
    const isAdmin = hasAdminPermission(request.user);
    if (existing.assigned_user_id && existing.assigned_user_id !== request.user.id && !isAdmin) {
      throw Errors.forbidden('Only the assigned user or an admin can update task status');
    }
    // For open/assigned tasks, only admin can cancel (not any task.* user)
    const newStatus = request.body.status;
    if (newStatus === 'cancelled' && (existing.status === 'open' || existing.status === 'assigned')) {
      if (!isAdmin) {
        throw Errors.forbidden('Only admins can cancel open or assigned tasks');
      }
    }
    const task = await tasksService.updateTaskStatus(
      request.params.id, request.user.id, request.body.status
    );
    return { success: true, data: task };
  });

  fastify.get('/api/worker-metrics', {
    preHandler: [authenticate, requirePermission('task.*')],
  }, async (request) => {
    const metrics = await tasksService.getWorkerMetrics(request.user.id);
    return { success: true, data: metrics };
  });
}
