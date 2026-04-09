import { query, transaction } from '../db/pool.js';
import { Errors } from '../utils/errors.js';
import { logAudit } from '../utils/audit.js';
import { logger } from '../utils/logger.js';

/**
 * Adjust inventory.reserved_qty for constrained slot transitions.
 * Must be called within a transaction (client).
 * delta > 0 = reserving slots (hold create), delta < 0 = releasing (cancel/expiry).
 */
export async function adjustInventoryReserved(client, slotIds, delta) {
  if (!slotIds || slotIds.length === 0 || delta === 0) return;

  // Group slot count by inventory_id
  const slotResult = await client.query(
    'SELECT inventory_id, COUNT(*)::int AS cnt FROM constrained_slots WHERE id = ANY($1) GROUP BY inventory_id',
    [slotIds]
  );

  for (const { inventory_id, cnt } of slotResult.rows) {
    const adjustment = cnt * delta;
    await client.query(
      `UPDATE inventory
       SET reserved_qty = GREATEST(0, reserved_qty + $1), updated_at = NOW()
       WHERE id = $2`,
      [adjustment, inventory_id]
    );
  }
}

export function validateAdjacency(selectedPositions, allSlots, rowCode) {
  const rowSlots = allSlots
    .filter(s => s.row_code === rowCode)
    .sort((a, b) => a.position_index - b.position_index);

  if (rowSlots.length === 0) return [];

  const maxPos = rowSlots[rowSlots.length - 1].position_index;
  const minPos = rowSlots[0].position_index;

  const selectedSet = new Set(selectedPositions);
  const occupiedOrSelected = new Set();

  for (const slot of rowSlots) {
    if (slot.status !== 'available' || selectedSet.has(slot.position_index)) {
      occupiedOrSelected.add(slot.position_index);
    }
  }

  const errors = [];
  for (let pos = minPos; pos <= maxPos; pos++) {
    if (occupiedOrSelected.has(pos)) continue;

    const leftOccupied = pos === minPos || occupiedOrSelected.has(pos - 1);
    const rightOccupied = pos === maxPos || occupiedOrSelected.has(pos + 1);

    if (leftOccupied && rightOccupied) {
      const isRowEnd = pos === minPos || pos === maxPos;
      if (!isRowEnd) {
        errors.push(`Selection would leave a single-seat gap at position ${pos} in row ${rowCode}`);
      }
    }
  }

  return errors;
}

export async function createHold(userId, slotIds, clientRequestKey) {
  return transaction(async (client) => {
    const existingHold = await client.query(
      "SELECT * FROM holds WHERE user_id = $1 AND client_request_key = $2 AND status = 'active'",
      [userId, clientRequestKey]
    );
    if (existingHold.rows.length > 0) {
      const hold = existingHold.rows[0];
      const holdSlots = await client.query(
        `SELECT cs.* FROM hold_slots hs
         JOIN constrained_slots cs ON cs.id = hs.slot_id
         WHERE hs.hold_id = $1`,
        [hold.id]
      );
      return { hold, slots: holdSlots.rows };
    }

    const slotsResult = await client.query(
      `SELECT * FROM constrained_slots WHERE id = ANY($1) FOR UPDATE`,
      [slotIds]
    );
    if (slotsResult.rows.length !== slotIds.length) {
      throw Errors.notFound('One or more slots');
    }

    const unavailable = slotsResult.rows.filter(s => s.status !== 'available');
    if (unavailable.length > 0) {
      throw Errors.conflict(`Slots already held/reserved: ${unavailable.map(s => `${s.row_code}-${s.position_index}`).join(', ')}`);
    }

    const inventoryIds = [...new Set(slotsResult.rows.map(s => s.inventory_id))];
    for (const invId of inventoryIds) {
      const invSlots = await client.query(
        'SELECT * FROM constrained_slots WHERE inventory_id = $1 FOR UPDATE',
        [invId]
      );
      const byRow = {};
      for (const slot of slotsResult.rows) {
        if (slot.inventory_id === invId) {
          if (!byRow[slot.row_code]) byRow[slot.row_code] = [];
          byRow[slot.row_code].push(slot.position_index);
        }
      }
      for (const [rowCode, positions] of Object.entries(byRow)) {
        const errors = validateAdjacency(positions, invSlots.rows, rowCode);
        if (errors.length > 0) {
          throw Errors.validation('Adjacency validation failed', { errors });
        }
      }
    }

    const holdDurationResult = await client.query(
      "SELECT value FROM system_config WHERE key = 'hold_duration_minutes'"
    );
    const holdMinutes = holdDurationResult.rows[0]?.value?.value || 10;
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);

    let holdResult;
    try {
      holdResult = await client.query(
        `INSERT INTO holds (client_request_key, user_id, status, expires_at)
         VALUES ($1, $2, 'active', $3) RETURNING *`,
        [clientRequestKey, userId, expiresAt]
      );
    } catch (insertErr) {
      if (insertErr.code === '23505' && insertErr.constraint?.includes('client_request_key')) {
        // Race condition: another request inserted with the same key concurrently
        const raceHold = await client.query(
          "SELECT * FROM holds WHERE user_id = $1 AND client_request_key = $2",
          [userId, clientRequestKey]
        );
        if (raceHold.rows.length > 0) {
          const holdSlots = await client.query(
            `SELECT cs.* FROM hold_slots hs
             JOIN constrained_slots cs ON cs.id = hs.slot_id
             WHERE hs.hold_id = $1`,
            [raceHold.rows[0].id]
          );
          return { hold: raceHold.rows[0], slots: holdSlots.rows };
        }
      }
      throw insertErr;
    }
    const hold = holdResult.rows[0];

    for (const slotId of slotIds) {
      await client.query(
        'INSERT INTO hold_slots (hold_id, slot_id) VALUES ($1, $2)',
        [hold.id, slotId]
      );
      await client.query(
        "UPDATE constrained_slots SET status = 'held' WHERE id = $1",
        [slotId]
      );
    }

    // Sync aggregate inventory: holding slots increases reserved count
    await adjustInventoryReserved(client, slotIds, +1);

    await logAudit(userId, 'hold_created', 'hold', hold.id,
      { slots: slotIds.length, expires_at: expiresAt }, null, client);

    return { hold, slots: slotsResult.rows };
  });
}

export async function getHold(holdId, requestingUser = null) {
  const holdResult = await query('SELECT * FROM holds WHERE id = $1', [holdId]);
  if (holdResult.rows.length === 0) throw Errors.notFound('Hold');
  const hold = holdResult.rows[0];

  if (requestingUser) {
    const isAdmin = requestingUser.permissions && requestingUser.permissions.some(p => p === 'admin.*');
    if (!isAdmin && hold.user_id !== requestingUser.id) {
      throw Errors.forbidden('You can only view your own holds');
    }
  }

  const slotsResult = await query(
    `SELECT cs.* FROM hold_slots hs
     JOIN constrained_slots cs ON cs.id = hs.slot_id
     WHERE hs.hold_id = $1`,
    [holdId]
  );

  return { hold, slots: slotsResult.rows };
}

export async function cancelHold(holdId, userId) {
  return transaction(async (client) => {
    const holdResult = await client.query(
      "SELECT * FROM holds WHERE id = $1 AND status = 'active' FOR UPDATE",
      [holdId]
    );
    if (holdResult.rows.length === 0) throw Errors.notFound('Active hold');
    const hold = holdResult.rows[0];

    if (hold.user_id !== userId) throw Errors.forbidden('Can only cancel your own holds');

    await client.query("UPDATE holds SET status = 'released' WHERE id = $1", [holdId]);

    const slots = await client.query(
      'SELECT slot_id FROM hold_slots WHERE hold_id = $1',
      [holdId]
    );
    const slotIds = slots.rows.map(r => r.slot_id);
    for (const slot_id of slotIds) {
      await client.query(
        "UPDATE constrained_slots SET status = 'available' WHERE id = $1",
        [slot_id]
      );
    }

    // Sync aggregate inventory: releasing slots decreases reserved count
    await adjustInventoryReserved(client, slotIds, -1);

    await logAudit(userId, 'hold_cancelled', 'hold', holdId, {}, null, client);
    return { success: true };
  });
}

export async function commitHold(holdId, userId, idempotencyKey, requestingUser = null) {
  return transaction(async (client) => {
    const existingOrder = await client.query(
      'SELECT id FROM orders WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    if (existingOrder.rows.length > 0) {
      throw Errors.duplicate('Order already exists for this idempotency key');
    }

    const holdResult = await client.query(
      "SELECT * FROM holds WHERE id = $1 AND status = 'active' FOR UPDATE",
      [holdId]
    );
    if (holdResult.rows.length === 0) throw Errors.notFound('Active hold');
    const hold = holdResult.rows[0];

    if (requestingUser) {
      const isAdmin = requestingUser.permissions && requestingUser.permissions.some(p => p === 'admin.*');
      if (!isAdmin && hold.user_id !== requestingUser.id) {
        throw Errors.forbidden('You can only commit your own holds');
      }
    }

    if (new Date(hold.expires_at) < new Date()) {
      await client.query("UPDATE holds SET status = 'expired' WHERE id = $1", [holdId]);
      throw Errors.conflict('Hold has expired');
    }

    await client.query("UPDATE holds SET status = 'committed' WHERE id = $1", [holdId]);

    const slots = await client.query(
      'SELECT slot_id FROM hold_slots WHERE hold_id = $1',
      [holdId]
    );
    for (const { slot_id } of slots.rows) {
      await client.query(
        "UPDATE constrained_slots SET status = 'reserved' WHERE id = $1",
        [slot_id]
      );
    }

    // Calculate real order value from held slots
    const holdSlots = await client.query(
      `SELECT cs.inventory_id, i.sku_id, i.warehouse_id
       FROM hold_slots hs
       JOIN constrained_slots cs ON cs.id = hs.slot_id
       JOIN inventory i ON i.id = cs.inventory_id
       WHERE hs.hold_id = $1`,
      [holdId]
    );

    // Group by SKU for pricing
    const skuGroups = {};
    for (const slot of holdSlots.rows) {
      if (!skuGroups[slot.sku_id]) {
        skuGroups[slot.sku_id] = { sku_id: slot.sku_id, warehouse_id: slot.warehouse_id, inventory_id: slot.inventory_id, quantity: 0 };
      }
      skuGroups[slot.sku_id].quantity++;
    }

    let total = 0;
    const lineData = [];
    for (const group of Object.values(skuGroups)) {
      // Get preferred supplier pricing
      const pricingResult = await client.query(
        `SELECT ss.unit_price, ss.supplier_id FROM sku_suppliers ss
         JOIN suppliers s ON s.id = ss.supplier_id
         WHERE ss.sku_id = $1 AND ss.is_active = true AND s.status = 'active'
         ORDER BY ss.is_preferred DESC, ss.unit_price ASC LIMIT 1`,
        [group.sku_id]
      );
      if (pricingResult.rows.length === 0) {
        throw Errors.validation(`No active supplier pricing found for SKU ${group.sku_id}`);
      }
      const price = pricingResult.rows[0]?.unit_price || 0;
      const supplierId = pricingResult.rows[0]?.supplier_id;
      const lineTotal = group.quantity * parseFloat(price);
      total += lineTotal;
      lineData.push({ ...group, unit_price: price, supplier_id: supplierId, line_total: lineTotal });
    }

    // Create the order with real values
    let orderResult;
    try {
      orderResult = await client.query(
        `INSERT INTO orders (buyer_user_id, idempotency_key, status, total, handling_fee, tax)
         VALUES ($1, $2, 'confirmed', $3, 0, 0) RETURNING *`,
        [userId, idempotencyKey, total]
      );
    } catch (insertErr) {
      if (insertErr.code === '23505' && insertErr.constraint?.includes('idempotency_key')) {
        throw Errors.duplicate('Order already exists for this idempotency key');
      }
      throw insertErr;
    }

    // Create order lines and allocations
    for (const line of lineData) {
      const olResult = await client.query(
        `INSERT INTO order_lines (order_id, sku_id, supplier_id, warehouse_id, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [orderResult.rows[0].id, line.sku_id, line.supplier_id, line.warehouse_id, line.quantity, line.unit_price, line.line_total]
      );
      await client.query(
        `INSERT INTO order_line_allocations (order_line_id, inventory_id, warehouse_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [olResult.rows[0].id, line.inventory_id, line.warehouse_id, line.quantity]
      );
    }

    // Generate fulfillment tasks
    const { createTasksForOrder } = await import('./tasks.js');
    await createTasksForOrder(orderResult.rows[0].id);

    await logAudit(userId, 'hold_committed', 'hold', holdId, { order_id: orderResult.rows[0].id }, null, client);

    return { order: orderResult.rows[0], hold };
  });
}

export async function releaseExpiredHolds() {
  return transaction(async (client) => {
    const expired = await client.query(
      "SELECT id FROM holds WHERE status = 'active' AND expires_at < NOW() FOR UPDATE"
    );

    let released = 0;
    for (const hold of expired.rows) {
      await client.query("UPDATE holds SET status = 'expired' WHERE id = $1", [hold.id]);

      const slots = await client.query(
        'SELECT slot_id FROM hold_slots WHERE hold_id = $1',
        [hold.id]
      );
      const slotIds = slots.rows.map(r => r.slot_id);
      for (const slot_id of slotIds) {
        await client.query(
          "UPDATE constrained_slots SET status = 'available' WHERE id = $1",
          [slot_id]
        );
      }

      // Sync aggregate inventory: expiring slots decreases reserved count
      await adjustInventoryReserved(client, slotIds, -1);
      released++;
    }

    if (released > 0) {
      logger.info('holds', `Released ${released} expired holds`, { count: released });
    }
    return released;
  });
}

export async function listSlots(inventoryId) {
  const result = await query(
    'SELECT * FROM constrained_slots WHERE inventory_id = $1 ORDER BY row_code, position_index',
    [inventoryId]
  );
  return result.rows;
}
