import { query, transaction } from '../db/pool.js';
import { Errors } from '../utils/errors.js';
import { logAudit } from '../utils/audit.js';

/**
 * Pure function: determines if a non-admin user can see a specific task.
 * Admins can see all tasks. Non-admins can see:
 * - Tasks assigned to them
 * - Open unassigned (grabbable) tasks
 */
export function canUserSeeTask(task, userId, isAdmin) {
  if (isAdmin) return true;
  if (task.assigned_user_id === userId) return true;
  if (!task.assigned_user_id && task.status === 'open') return true;
  return false;
}

export function computeTaskScore(task, workerMetric, weights) {
  const w = weights || { time_window: 0.4, workload: 0.3, reputation: 0.3 };

  let timeWindowScore = 50;
  if (task.due_window_end) {
    const now = Date.now();
    const deadline = new Date(task.due_window_end).getTime();
    const hoursLeft = (deadline - now) / (1000 * 60 * 60);
    if (hoursLeft <= 0) timeWindowScore = 100;
    else if (hoursLeft <= 1) timeWindowScore = 90;
    else if (hoursLeft <= 4) timeWindowScore = 70;
    else if (hoursLeft <= 8) timeWindowScore = 50;
    else timeWindowScore = 30;
  }

  let workloadScore = 50;
  if (workerMetric) {
    const active = workerMetric.active_task_count || 0;
    if (active === 0) workloadScore = 100;
    else if (active <= 2) workloadScore = 70;
    else if (active <= 5) workloadScore = 40;
    else workloadScore = 10;
  }

  let reputationScore = workerMetric?.reputation_score || 50;

  const total = (timeWindowScore * w.time_window) +
                (workloadScore * w.workload) +
                (reputationScore * w.reputation);

  return {
    total: Math.round(total * 100) / 100,
    breakdown: { time_window: timeWindowScore, workload: workloadScore, reputation: reputationScore },
  };
}

export async function listTasks(filters = {}) {
  let sql = `
    SELECT t.*, w.name as warehouse_name, u.display_name as assigned_user_name
    FROM tasks t
    LEFT JOIN warehouses w ON w.id = t.warehouse_id
    LEFT JOIN users u ON u.id = t.assigned_user_id
  `;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`t.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.warehouse_ids && Array.isArray(filters.warehouse_ids)) {
    if (filters.warehouse_ids.length === 0) {
      // Empty scope = hard deny — return nothing
      return [];
    }
    conditions.push(`t.warehouse_id = ANY($${idx++})`);
    params.push(filters.warehouse_ids);
  } else if (filters.warehouse_id) {
    conditions.push(`t.warehouse_id = $${idx++}`);
    params.push(filters.warehouse_id);
  }
  if (filters.mode === 'assigned' && filters.user_id) {
    conditions.push(`t.assigned_user_id = $${idx++}`);
    params.push(filters.user_id);
  } else if (filters.mode === 'grab') {
    conditions.push(`t.assigned_user_id IS NULL`);
    conditions.push(`t.status = 'open'`);
  } else if (filters.mode === 'own_and_grab' && filters.user_id) {
    // Non-admin default — show tasks assigned to user OR open/unassigned
    conditions.push(`(t.assigned_user_id = $${idx++} OR (t.assigned_user_id IS NULL AND t.status = 'open'))`);
    params.push(filters.user_id);
  } else if (filters.mode && filters.mode !== 'all') {
    // Defensive: unrecognized mode with a user_id falls back to own_and_grab
    // so no caller can accidentally get an unfiltered listing.
    if (filters.user_id) {
      conditions.push(`(t.assigned_user_id = $${idx++} OR (t.assigned_user_id IS NULL AND t.status = 'open'))`);
      params.push(filters.user_id);
    }
  }
  // mode=undefined or mode='all' with no user_id: admin-only broad listing (no assignment filter)

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY t.priority DESC, t.due_window_end ASC NULLS LAST, t.created_at ASC';

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, (page - 1) * limit);

  const result = await query(sql, params);
  return result.rows;
}

export async function getTask(taskId) {
  const result = await query(
    `SELECT t.*, w.name as warehouse_name, u.display_name as assigned_user_name
     FROM tasks t
     LEFT JOIN warehouses w ON w.id = t.warehouse_id
     LEFT JOIN users u ON u.id = t.assigned_user_id
     WHERE t.id = $1`,
    [taskId]
  );
  if (result.rows.length === 0) throw Errors.notFound('Task');
  return result.rows[0];
}

export async function assignTask(taskId, assignedUserId) {
  return transaction(async (client) => {
    const taskResult = await client.query(
      'SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [taskId]
    );
    if (taskResult.rows.length === 0) throw Errors.notFound('Task');
    const task = taskResult.rows[0];

    if (task.status !== 'open') {
      throw Errors.conflict(`Task cannot be assigned (current status: ${task.status})`);
    }

    // Validate assignee exists and is active
    const assigneeResult = await client.query(
      'SELECT id, status FROM users WHERE id = $1',
      [assignedUserId]
    );
    if (assigneeResult.rows.length === 0) {
      throw Errors.notFound('Assignee user not found');
    }
    if (assigneeResult.rows[0].status !== 'active') {
      throw Errors.validation('Assignee user is not active');
    }

    // Check assignee has task.* or admin.* permission via role lookup
    const rolePerms = await client.query(
      `SELECT r.permissions FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [assignedUserId]
    );
    const allPerms = rolePerms.rows.flatMap(r => r.permissions || []);
    const hasTaskPerm = allPerms.some(p => p === 'task.*' || p === 'admin.*');
    if (!hasTaskPerm) {
      throw Errors.validation('Assignee does not have dispatch capability');
    }

    // If task has a warehouse, check assignee has access to that warehouse
    if (task.warehouse_id) {
      const assigneeScopes = await client.query(
        'SELECT scope_type, scope_id FROM user_scopes WHERE user_id = $1',
        [assignedUserId]
      );
      const scopes = assigneeScopes.rows;
      // If assignee has scopes at all, check warehouse access
      if (scopes.length > 0) {
        const warehouseScopes = scopes.filter(s => s.scope_type === 'warehouse').map(s => s.scope_id);
        const storeScopes = scopes.filter(s => s.scope_type === 'store').map(s => s.scope_id);

        let hasWarehouseAccess = false;
        if (warehouseScopes.includes(task.warehouse_id)) {
          hasWarehouseAccess = true;
        } else if (storeScopes.length > 0) {
          // Resolve store → warehouse mapping
          const mapping = await client.query(
            'SELECT warehouse_id FROM store_warehouses WHERE store_id = ANY($1)',
            [storeScopes]
          );
          hasWarehouseAccess = mapping.rows.some(r => r.warehouse_id === task.warehouse_id);
        } else if (warehouseScopes.length === 0 && storeScopes.length === 0) {
          hasWarehouseAccess = true; // No scope restrictions = unrestricted
        }

        if (!hasWarehouseAccess) {
          throw Errors.validation('Assignee is not in scope for this task\'s warehouse');
        }
      }
    }

    // Proceed with assignment
    await client.query(
      `UPDATE tasks SET status = 'assigned', assigned_user_id = $1,
       version = version + 1, updated_at = NOW() WHERE id = $2`,
      [assignedUserId, taskId]
    );

    await client.query(
      'INSERT INTO task_history (task_id, user_id, action) VALUES ($1, $2, $3)',
      [taskId, assignedUserId, 'assigned']
    );

    // Read within transaction to return committed state
    const result = await client.query(
      `SELECT t.*, w.name as warehouse_name, u.display_name as assigned_user_name
       FROM tasks t
       LEFT JOIN warehouses w ON w.id = t.warehouse_id
       LEFT JOIN users u ON u.id = t.assigned_user_id
       WHERE t.id = $1`, [taskId]
    );
    return result.rows[0];
  });
}

export async function acceptTask(taskId, userId, version) {
  return transaction(async (client) => {
    const taskResult = await client.query(
      'SELECT * FROM tasks WHERE id = $1 FOR UPDATE',
      [taskId]
    );
    if (taskResult.rows.length === 0) throw Errors.notFound('Task');
    const task = taskResult.rows[0];

    if (task.version !== version) {
      throw Errors.conflict('Task has been modified (version mismatch)');
    }

    if (task.status !== 'open' && task.status !== 'assigned') {
      throw Errors.conflict(`Task cannot be accepted (current status: ${task.status})`);
    }

    if (task.assigned_user_id && task.assigned_user_id !== userId) {
      throw Errors.conflict('Task is assigned to another user');
    }

    await client.query(
      `UPDATE tasks SET status = 'accepted', assigned_user_id = $1,
       version = version + 1, updated_at = NOW() WHERE id = $2`,
      [userId, taskId]
    );

    await client.query(
      'INSERT INTO task_history (task_id, user_id, action) VALUES ($1, $2, $3)',
      [taskId, userId, 'accepted']
    );

    await client.query(
      `INSERT INTO worker_metrics (user_id, active_task_count, last_computed_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET active_task_count = worker_metrics.active_task_count + 1, last_computed_at = NOW()`,
      [userId]
    );

    await logAudit(userId, 'task_accepted', 'task', taskId, {}, null);

    return getTask(taskId);
  });
}

export async function updateTaskStatus(taskId, userId, newStatus) {
  return transaction(async (client) => {
    const taskResult = await client.query(
      'SELECT * FROM tasks WHERE id = $1 FOR UPDATE',
      [taskId]
    );
    if (taskResult.rows.length === 0) throw Errors.notFound('Task');
    const task = taskResult.rows[0];

    const validTransitions = {
      accepted: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'failed', 'cancelled'],
      assigned: ['cancelled'],
      open: ['cancelled'],
    };

    const allowed = validTransitions[task.status] || [];
    if (!allowed.includes(newStatus)) {
      throw Errors.validation(`Cannot transition from ${task.status} to ${newStatus}`);
    }

    await client.query(
      `UPDATE tasks SET status = $1, version = version + 1, updated_at = NOW() WHERE id = $2`,
      [newStatus, taskId]
    );

    await client.query(
      'INSERT INTO task_history (task_id, user_id, action) VALUES ($1, $2, $3)',
      [taskId, userId, newStatus]
    );

    if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') {
      await client.query(
        `UPDATE worker_metrics SET active_task_count = GREATEST(0, active_task_count - 1),
         last_computed_at = NOW() WHERE user_id = $1`,
        [task.assigned_user_id || userId]
      );

      if (newStatus === 'completed') {
        await client.query(
          `UPDATE worker_metrics SET completed_count = completed_count + 1,
           last_computed_at = NOW() WHERE user_id = $1`,
          [task.assigned_user_id || userId]
        );
      }
      if (newStatus === 'failed') {
        await client.query(
          `UPDATE worker_metrics SET failed_count = failed_count + 1,
           last_computed_at = NOW() WHERE user_id = $1`,
          [task.assigned_user_id || userId]
        );
      }

      // Reconcile inventory for THIS TASK's allocations only (not the whole order).
      // task.order_line_ids contains the specific order lines owned by this task.
      const rawLineIds = task.order_line_ids;
      const taskLineIds = Array.isArray(rawLineIds)
        ? rawLineIds
        : (typeof rawLineIds === 'string' ? JSON.parse(rawLineIds) : []);

      if (taskLineIds.length > 0) {
        if (newStatus === 'completed') {
          // Completed: convert reserved → consumed (reduce both available_qty and reserved_qty)
          const allocs = await client.query(
            `SELECT ola.inventory_id, ola.quantity
             FROM order_line_allocations ola
             WHERE ola.order_line_id = ANY($1::uuid[])`,
            [taskLineIds]
          );
          for (const alloc of allocs.rows) {
            await client.query(
              `UPDATE inventory SET available_qty = available_qty - $1,
               reserved_qty = GREATEST(0, reserved_qty - $1), updated_at = NOW()
               WHERE id = $2`,
              [alloc.quantity, alloc.inventory_id]
            );
          }
        } else if (newStatus === 'cancelled' || newStatus === 'failed') {
          // Cancelled/failed: release only this task's reservations
          const allocs = await client.query(
            `SELECT ola.inventory_id, ola.quantity
             FROM order_line_allocations ola
             WHERE ola.order_line_id = ANY($1::uuid[])`,
            [taskLineIds]
          );
          for (const alloc of allocs.rows) {
            await client.query(
              `UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1),
               updated_at = NOW() WHERE id = $2`,
              [alloc.quantity, alloc.inventory_id]
            );
          }
        }
      }
    }

    await logAudit(userId, `task_${newStatus}`, 'task', taskId, {}, null);

    return getTask(taskId);
  });
}

export async function getRecommendations(userId, warehouseScope) {
  const weightsResult = await query(
    "SELECT value FROM system_config WHERE key = 'task_score_weights'"
  );
  const weights = weightsResult.rows[0]?.value;

  const metricsResult = await query(
    'SELECT * FROM worker_metrics WHERE user_id = $1',
    [userId]
  );
  const workerMetric = metricsResult.rows[0] || { active_task_count: 0, reputation_score: 50 };

  // Scope enforcement: empty array = hard deny
  if (Array.isArray(warehouseScope) && warehouseScope.length === 0) {
    return [];
  }

  let tasksSql = `SELECT t.*, w.name as warehouse_name
    FROM tasks t LEFT JOIN warehouses w ON w.id = t.warehouse_id
    WHERE t.status = 'open' AND t.assigned_user_id IS NULL`;
  const params = [];
  let idx = 1;
  if (Array.isArray(warehouseScope) && warehouseScope.length > 0) {
    tasksSql += ` AND t.warehouse_id = ANY($${idx++})`;
    params.push(warehouseScope);
  } else if (warehouseScope && !Array.isArray(warehouseScope)) {
    // Single warehouse ID (legacy compat)
    tasksSql += ` AND t.warehouse_id = $${idx++}`;
    params.push(warehouseScope);
  }
  tasksSql += ' ORDER BY t.due_window_end ASC NULLS LAST LIMIT 20';

  const tasksResult = await query(tasksSql, params);

  const scored = tasksResult.rows.map(task => ({
    ...task,
    recommendation: computeTaskScore(task, workerMetric, weights),
  }));

  scored.sort((a, b) => b.recommendation.total - a.recommendation.total);
  return scored;
}

export async function getWorkerMetrics(userId) {
  const result = await query('SELECT * FROM worker_metrics WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) {
    return { user_id: userId, completed_count: 0, failed_count: 0, avg_completion_minutes: 0, reputation_score: 50, active_task_count: 0 };
  }
  return result.rows[0];
}

export async function recomputeWorkerMetrics() {
  const workers = await query('SELECT DISTINCT user_id FROM worker_metrics');
  for (const { user_id } of workers.rows) {
    const stats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE action = 'completed') as completed,
         COUNT(*) FILTER (WHERE action = 'failed') as failed
       FROM task_history WHERE user_id = $1`,
      [user_id]
    );
    const completed = parseInt(stats.rows[0]?.completed || 0);
    const failed = parseInt(stats.rows[0]?.failed || 0);
    const total = completed + failed;
    const reputation = total > 0 ? Math.min(100, (completed / total) * 100) : 50;

    const active = await query(
      "SELECT COUNT(*) FROM tasks WHERE assigned_user_id = $1 AND status IN ('accepted', 'in_progress')",
      [user_id]
    );

    await query(
      `UPDATE worker_metrics SET completed_count = $1, failed_count = $2,
       reputation_score = $3, active_task_count = $4, last_computed_at = NOW()
       WHERE user_id = $5`,
      [completed, failed, Math.round(reputation * 100) / 100, parseInt(active.rows[0].count), user_id]
    );
  }
}

export async function createTasksForOrder(orderId) {
  const order = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (order.rows.length === 0) return;

  // Read allocation-derived warehouse assignments
  const allocations = await query(
    `SELECT ol.id as order_line_id, ol.split_group, ola.warehouse_id, ola.quantity
     FROM order_lines ol
     JOIN order_line_allocations ola ON ola.order_line_id = ol.id
     WHERE ol.order_id = $1
     ORDER BY ol.split_group, ola.warehouse_id`,
    [orderId]
  );
  if (allocations.rows.length === 0) return;

  // Group by (split_group, warehouse_id) for correct task decomposition
  const taskGroups = {};
  for (const row of allocations.rows) {
    const key = `${row.split_group || 'default'}:${row.warehouse_id}`;
    if (!taskGroups[key]) {
      taskGroups[key] = { warehouse_id: row.warehouse_id, order_line_ids: new Set() };
    }
    taskGroups[key].order_line_ids.add(row.order_line_id);
  }

  for (const group of Object.values(taskGroups)) {
    await query(
      `INSERT INTO tasks (order_id, order_line_ids, warehouse_id, status, priority, due_window_end)
       VALUES ($1, $2, $3, 'open', $4, $5)`,
      [orderId, JSON.stringify([...group.order_line_ids]), group.warehouse_id, 0,
       new Date(Date.now() + 24 * 60 * 60 * 1000)]
    );
  }
}
