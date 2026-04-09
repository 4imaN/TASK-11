import { query, transaction } from '../db/pool.js';
import { Errors } from '../utils/errors.js';

export function computeThresholdState(availableQty, reservedQty, thresholdWarning, thresholdCritical) {
  const effective = availableQty - reservedQty;
  if (effective <= thresholdCritical) return 'critical';
  if (effective <= thresholdWarning) return 'warning';
  return 'normal';
}

export async function listInventory(filters = {}) {
  let sql = `
    SELECT i.*, s.sku_code, sp.name as spu_name, w.name as warehouse_name, w.code as warehouse_code
    FROM inventory i
    JOIN skus s ON s.id = i.sku_id
    JOIN spus sp ON sp.id = s.spu_id
    JOIN warehouses w ON w.id = i.warehouse_id
  `;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.warehouse_ids && Array.isArray(filters.warehouse_ids)) {
    if (filters.warehouse_ids.length === 0) {
      // Empty scope = hard deny — return nothing
      return [];
    }
    conditions.push(`i.warehouse_id = ANY($${idx++})`);
    params.push(filters.warehouse_ids);
  } else if (filters.warehouse_id) {
    conditions.push(`i.warehouse_id = $${idx++}`);
    params.push(filters.warehouse_id);
  }
  if (filters.sku_id) {
    conditions.push(`i.sku_id = $${idx++}`);
    params.push(filters.sku_id);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY sp.name, s.sku_code';

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, (page - 1) * limit);

  const result = await query(sql, params);
  const items = result.rows.map(row => ({
    ...row,
    threshold_state: computeThresholdState(row.available_qty, row.reserved_qty, row.threshold_warning, row.threshold_critical),
  }));

  if (filters.threshold_state) {
    return items.filter(i => i.threshold_state === filters.threshold_state);
  }

  return items;
}

export async function createOrUpdateInventory(data) {
  const lotNumber = data.lot_number || null;

  // For NULL lot_number, use advisory lock to prevent TOCTOU race
  if (lotNumber === null) {
    return transaction(async (client) => {
      // Advisory lock on (sku_id, warehouse_id) hash to serialize concurrent upserts
      const lockKey = Buffer.from(data.sku_id + data.warehouse_id).reduce((h, b) => (h * 31 + b) & 0x7fffffff, 0);
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

      const existing = await client.query(
        'SELECT id FROM inventory WHERE sku_id = $1 AND warehouse_id = $2 AND lot_number IS NULL',
        [data.sku_id, data.warehouse_id]
      );
      if (existing.rows.length > 0) {
        const result = await client.query(
          `UPDATE inventory SET available_qty = $1, reserved_qty = COALESCE($2, reserved_qty),
           threshold_warning = COALESCE($3, threshold_warning),
           threshold_critical = COALESCE($4, threshold_critical), updated_at = NOW()
           WHERE id = $5 RETURNING *`,
          [data.available_qty, data.reserved_qty !== undefined ? data.reserved_qty : null,
           data.threshold_warning || 15, data.threshold_critical || 5, existing.rows[0].id]
        );
        return result.rows[0];
      }

      // No existing row — insert within the same advisory lock
      const result = await client.query(
        `INSERT INTO inventory (sku_id, warehouse_id, lot_number, available_qty, threshold_warning, threshold_critical)
         VALUES ($1, $2, NULL, $3, $4, $5) RETURNING *`,
        [data.sku_id, data.warehouse_id, data.available_qty, data.threshold_warning || 15, data.threshold_critical || 5]
      );
      return result.rows[0];
    });
  }

  // Non-null lot_number — normal ON CONFLICT upsert (unique constraint handles it)
  const hasReservedReset = data.reserved_qty !== undefined;
  const reservedClause = hasReservedReset ? ', reserved_qty = $7' : '';
  const params = [data.sku_id, data.warehouse_id, lotNumber,
     data.available_qty, data.threshold_warning || 15, data.threshold_critical || 5];
  if (hasReservedReset) params.push(parseInt(data.reserved_qty));
  const result = await query(
    `INSERT INTO inventory (sku_id, warehouse_id, lot_number, available_qty, threshold_warning, threshold_critical)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sku_id, warehouse_id, lot_number)
     DO UPDATE SET available_qty = $4, threshold_warning = COALESCE($5, inventory.threshold_warning),
       threshold_critical = COALESCE($6, inventory.threshold_critical)${reservedClause}, updated_at = NOW()
     RETURNING *`,
    params
  );
  return result.rows[0];
}

export async function updateInventory(id, data) {
  const result = await query(
    `UPDATE inventory SET available_qty = COALESCE($1, available_qty),
     threshold_warning = COALESCE($2, threshold_warning),
     threshold_critical = COALESCE($3, threshold_critical), updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [data.available_qty, data.threshold_warning, data.threshold_critical, id]
  );
  if (result.rows.length === 0) throw Errors.notFound('Inventory');
  return result.rows[0];
}

export async function listWarehouses(warehouseScope = null) {
  if (warehouseScope && warehouseScope.length > 0) {
    const result = await query('SELECT * FROM warehouses WHERE id = ANY($1) ORDER BY name', [warehouseScope]);
    return result.rows;
  }
  const result = await query('SELECT * FROM warehouses ORDER BY name');
  return result.rows;
}

export async function createWarehouse(data) {
  const result = await query(
    'INSERT INTO warehouses (name, code, address) VALUES ($1, $2, $3) RETURNING *',
    [data.name, data.code, data.address]
  );
  return result.rows[0];
}

export async function getInventoryById(id) {
  const result = await query('SELECT * FROM inventory WHERE id = $1', [id]);
  if (result.rows.length === 0) throw Errors.notFound('Inventory');
  return result.rows[0];
}

export async function getInventoryForSKU(skuId, warehouseId) {
  const sql = warehouseId
    ? 'SELECT * FROM inventory WHERE sku_id = $1 AND warehouse_id = $2'
    : 'SELECT * FROM inventory WHERE sku_id = $1';
  const params = warehouseId ? [skuId, warehouseId] : [skuId];
  const result = await query(sql, params);
  return result.rows;
}
