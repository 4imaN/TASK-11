import { query, transaction } from '../db/pool.js';
import { Errors } from '../utils/errors.js';
import { computeEstimate, validateMOQAndPackSize, getPreferredSupplier, roundMoney } from './pricing.js';
import { logAudit } from '../utils/audit.js';

/**
 * Central cart scope invariant. Called on EVERY cart operation.
 * - Validates cart belongs to the user
 * - Validates cart.store_id is within the user's effective store scope
 * - Rejects scoped users with empty store scope (hard deny)
 */
export function assertCartAccess(cart, userId, storeScope) {
  if (!cart) throw Errors.notFound('Cart');
  if (cart.buyer_user_id !== userId) throw Errors.forbidden('Cart belongs to another user');
  // If storeScope is null, user is unrestricted (admin or no scopes at all)
  if (storeScope === null) return;
  // Empty array = scoped user with no store access = hard deny
  if (Array.isArray(storeScope) && storeScope.length === 0) {
    throw Errors.scopeDenied();
  }
  // Cart must have a store_id and it must be in scope
  if (!cart.store_id) {
    throw Errors.scopeDenied();
  }
  if (!storeScope.includes(cart.store_id)) {
    throw Errors.scopeDenied();
  }
}

export async function getOrCreateCart(userId, storeId) {
  // Find active cart matching the user AND store (prevents scope mismatch on reuse)
  let sql = "SELECT * FROM carts WHERE buyer_user_id = $1 AND status = 'active'";
  const params = [userId];
  if (storeId) {
    sql += ' AND store_id = $2';
    params.push(storeId);
  } else {
    sql += ' AND store_id IS NULL';
  }
  sql += ' ORDER BY created_at DESC LIMIT 1';

  const existing = await query(sql, params);
  if (existing.rows.length > 0) return existing.rows[0];

  const result = await query(
    'INSERT INTO carts (buyer_user_id, store_id) VALUES ($1, $2) RETURNING *',
    [userId, storeId]
  );
  return result.rows[0];
}

export async function getCart(userId, storeScope = null) {
  // Empty scope array = hard deny
  if (Array.isArray(storeScope) && storeScope.length === 0) {
    return { cart: null, items: [] };
  }
  let cartSql = "SELECT * FROM carts WHERE buyer_user_id = $1 AND status = 'active'";
  const cartParams = [userId];
  if (storeScope && Array.isArray(storeScope) && storeScope.length > 0) {
    cartSql += ' AND store_id = ANY($2)';
    cartParams.push(storeScope);
  }
  cartSql += ' ORDER BY created_at DESC LIMIT 1';

  const cart = await query(cartSql, cartParams);
  if (cart.rows.length === 0) return { cart: null, items: [] };

  // Validate scope invariant on the found cart
  if (storeScope !== undefined && storeScope !== null) {
    assertCartAccess(cart.rows[0], userId, storeScope);
  }

  const items = await query(
    `SELECT ci.*, s.sku_code, sp.name as spu_name, sup.name as supplier_name
     FROM cart_items ci
     JOIN skus s ON s.id = ci.sku_id
     JOIN spus sp ON sp.id = s.spu_id
     LEFT JOIN suppliers sup ON sup.id = ci.supplier_id
     WHERE ci.cart_id = $1 ORDER BY ci.created_at`,
    [cart.rows[0].id]
  );

  return { cart: cart.rows[0], items: items.rows };
}

export async function addCartItem(userId, storeId, data, storeScope = null) {
  // Hard deny for scoped users with empty store scope
  if (Array.isArray(storeScope) && storeScope.length === 0) {
    throw Errors.scopeDenied();
  }

  const pricing = await getPreferredSupplier(data.sku_id, data.supplier_id);

  const moqErrors = validateMOQAndPackSize(data.quantity, pricing.moq, pricing.pack_size);
  if (moqErrors.length > 0) {
    throw Errors.validation('MOQ/pack-size violation', { errors: moqErrors });
  }

  const cart = await getOrCreateCart(userId, storeId);

  // Revalidate scope on the cart that was found/created
  if (storeScope !== null) {
    assertCartAccess(cart, userId, storeScope);
  }

  const existing = await query(
    'SELECT * FROM cart_items WHERE cart_id = $1 AND sku_id = $2 AND (supplier_id = $3 OR (supplier_id IS NULL AND $3 IS NULL))',
    [cart.id, data.sku_id, data.supplier_id || null]
  );

  if (existing.rows.length > 0) {
    const newQty = existing.rows[0].quantity + data.quantity;
    const moqErrors2 = validateMOQAndPackSize(newQty, pricing.moq, pricing.pack_size);
    if (moqErrors2.length > 0) {
      throw Errors.validation('MOQ/pack-size violation for combined quantity', { errors: moqErrors2 });
    }
    await query(
      'UPDATE cart_items SET quantity = $1, unit_price_snapshot = $2 WHERE id = $3',
      [newQty, pricing.unit_price, existing.rows[0].id]
    );
  } else {
    await query(
      'INSERT INTO cart_items (cart_id, sku_id, supplier_id, quantity, unit_price_snapshot) VALUES ($1, $2, $3, $4, $5)',
      [cart.id, data.sku_id, data.supplier_id || null, data.quantity, pricing.unit_price]
    );
  }

  return getCart(userId, storeScope);
}

export async function updateCartItem(userId, itemId, data, storeScope = null) {
  const item = await query(
    `SELECT ci.*, c.buyer_user_id FROM cart_items ci
     JOIN carts c ON c.id = ci.cart_id
     WHERE ci.id = $1`,
    [itemId]
  );
  if (item.rows.length === 0) throw Errors.notFound('Cart item');
  if (item.rows[0].buyer_user_id !== userId) throw Errors.forbidden();

  const cartResult = await query('SELECT * FROM carts WHERE id = $1', [item.rows[0].cart_id]);
  if (cartResult.rows.length > 0) {
    assertCartAccess(cartResult.rows[0], userId, storeScope);
  }

  const pricing = await getPreferredSupplier(item.rows[0].sku_id, item.rows[0].supplier_id);
  const moqErrors = validateMOQAndPackSize(data.quantity, pricing.moq, pricing.pack_size);
  if (moqErrors.length > 0) {
    throw Errors.validation('MOQ/pack-size violation', { errors: moqErrors });
  }

  await query('UPDATE cart_items SET quantity = $1, unit_price_snapshot = $2 WHERE id = $3',
    [data.quantity, pricing.unit_price, itemId]);

  return getCart(userId, storeScope);
}

export async function removeCartItem(userId, itemId, storeScope = null) {
  const item = await query(
    `SELECT ci.id, ci.cart_id, c.buyer_user_id FROM cart_items ci
     JOIN carts c ON c.id = ci.cart_id WHERE ci.id = $1`,
    [itemId]
  );
  if (item.rows.length === 0) throw Errors.notFound('Cart item');
  if (item.rows[0].buyer_user_id !== userId) throw Errors.forbidden();

  const cartCheck = await query('SELECT * FROM carts WHERE id = $1', [item.rows[0].cart_id]);
  if (cartCheck.rows.length > 0 && storeScope !== null) {
    assertCartAccess(cartCheck.rows[0], userId, storeScope);
  }

  await query('DELETE FROM cart_items WHERE id = $1', [itemId]);
  return getCart(userId, storeScope);
}

export async function estimateCart(userId, storeScope = null, warehouseScope = null) {
  const { cart, items } = await getCart(userId, storeScope);
  if (!cart || items.length === 0) throw Errors.validation('Cart is empty');

  const estimate = await computeEstimate(items, cart.store_id);

  // Capture per-SKU inventory availability at estimate time
  const inventorySnapshot = {};
  for (const item of items) {
    if (!inventorySnapshot[item.sku_id]) {
      let invSql = 'SELECT SUM(available_qty - reserved_qty) as available FROM inventory WHERE sku_id = $1';
      const invParams = [item.sku_id];
      if (warehouseScope && warehouseScope.length > 0) {
        invSql += ' AND warehouse_id = ANY($2)';
        invParams.push(warehouseScope);
      }
      const invResult = await query(invSql, invParams);
      inventorySnapshot[item.sku_id] = {
        available: parseInt(invResult.rows[0]?.available || 0),
        requested: item.quantity,
      };
    }
  }
  estimate.inventory_snapshot = inventorySnapshot;

  const estResult = await query(
    `INSERT INTO order_estimates (cart_id, estimate_snapshot, total, handling_fee, tax)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [cart.id, JSON.stringify(estimate), estimate.grand_total, estimate.handling_fee, estimate.tax]
  );

  return { ...estimate, estimate_id: estResult.rows[0].id };
}

export async function checkout(userId, data, storeScope = null, warehouseScope = null) {
  return transaction(async (client) => {
    const existingOrder = await client.query(
      'SELECT id FROM orders WHERE idempotency_key = $1',
      [data.idempotency_key]
    );
    if (existingOrder.rows.length > 0) {
      throw Errors.duplicate('Order already submitted with this idempotency key');
    }

    // Find active cart. Use the estimate's cart_id for guaranteed consistency.
    const estCheck = await client.query(
      'SELECT cart_id FROM order_estimates WHERE id = $1', [data.estimate_id]
    );
    let cart;
    if (estCheck.rows.length > 0) {
      const cartResult = await client.query(
        "SELECT * FROM carts WHERE id = $1 AND buyer_user_id = $2 AND status = 'active'",
        [estCheck.rows[0].cart_id, userId]
      );
      if (cartResult.rows.length === 0) throw Errors.validation('No active cart for this estimate');
      cart = cartResult.rows[0];
    } else {
      throw Errors.validation('Estimate not found');
    }

    if (storeScope !== null) {
      assertCartAccess(cart, userId, storeScope);
    }

    const itemsResult = await client.query(
      'SELECT * FROM cart_items WHERE cart_id = $1',
      [cart.id]
    );
    if (itemsResult.rows.length === 0) throw Errors.validation('Cart is empty');

    const currentEstimate = await computeEstimate(itemsResult.rows, cart.store_id);

    if (!data.estimate_id) {
      throw Errors.validation('estimate_id is required for checkout');
    }
    const prevEstimate = await client.query(
      'SELECT * FROM order_estimates WHERE id = $1 AND cart_id = $2',
      [data.estimate_id, cart.id]
    );
    if (prevEstimate.rows.length > 0) {
      const oldTotal = parseFloat(prevEstimate.rows[0].total);
      const newTotal = currentEstimate.grand_total;
      const drift = Math.abs(newTotal - oldTotal);
      const driftPct = oldTotal > 0 ? (drift / oldTotal) * 100 : 0;

      if (driftPct > 2 && !data.confirmed_drift) {
        const lineChanges = currentEstimate.splits.flatMap(s => s.lines.map(l => ({
          sku_id: l.sku_id,
          old_price: itemsResult.rows.find(i => i.sku_id === l.sku_id)?.unit_price_snapshot,
          new_price: l.unit_price,
        })));

        throw Errors.driftDetected({
          drift_detected: true,
          old_total: oldTotal,
          new_total: newTotal,
          drift_pct: roundMoney(driftPct),
          line_changes: lineChanges,
          requires_confirmation: true,
        });
      }

      // Inventory drift check: compare current availability vs estimate-time availability
      const rawSnapshot = prevEstimate.rows[0].estimate_snapshot;
      const snapshot = typeof rawSnapshot === 'string' ? JSON.parse(rawSnapshot) : rawSnapshot;
      const invSnapshot = snapshot.inventory_snapshot;
      if (invSnapshot && !data.confirmed_drift) {
        const inventoryDrifts = [];
        for (const [skuId, estState] of Object.entries(invSnapshot)) {
          let driftInvSql = 'SELECT SUM(available_qty - reserved_qty) as available FROM inventory WHERE sku_id = $1';
          const driftParams = [skuId];
          if (warehouseScope && warehouseScope.length > 0) {
            driftInvSql += ' AND warehouse_id = ANY($2)';
            driftParams.push(warehouseScope);
          }
          const currentInv = await client.query(driftInvSql, driftParams);
          const currentAvail = parseInt(currentInv.rows[0]?.available || 0);
          const estAvail = estState.available;
          if (estAvail > 0) {
            const invDriftPct = Math.abs(currentAvail - estAvail) / estAvail * 100;
            if (invDriftPct > 2) {
              inventoryDrifts.push({
                sku_id: skuId,
                estimated_available: estAvail,
                current_available: currentAvail,
                drift_pct: Math.round(invDriftPct * 100) / 100,
              });
            }
          }
        }
        if (inventoryDrifts.length > 0) {
          throw Errors.driftDetected({
            drift_detected: true,
            old_total: parseFloat(prevEstimate.rows[0].total),
            new_total: currentEstimate.grand_total,
            drift_pct: roundMoney(driftPct),
            inventory_drift: inventoryDrifts,
            requires_confirmation: true,
          });
        }
      }
    }

    // Check inventory insufficiency (hard failure — not drift)
    const insufficientStock = [];
    for (const line of currentEstimate.splits.flatMap(s => s.lines)) {
      let stockSql = 'SELECT SUM(available_qty - reserved_qty) as available FROM inventory WHERE sku_id = $1';
      const stockParams = [line.sku_id];
      if (warehouseScope && warehouseScope.length > 0) {
        stockSql += ' AND warehouse_id = ANY($2)';
        stockParams.push(warehouseScope);
      }
      const invCheck = await client.query(stockSql, stockParams);
      const available = parseInt(invCheck.rows[0]?.available || 0);
      if (available < line.quantity) {
        insufficientStock.push({ sku_id: line.sku_id, requested: line.quantity, available });
      }
    }
    if (insufficientStock.length > 0) {
      throw Errors.validation('Insufficient inventory', { insufficient_stock: insufficientStock });
    }

    for (const line of currentEstimate.splits.flatMap(s => s.lines)) {
      let invSql = 'SELECT available_qty, reserved_qty FROM inventory WHERE sku_id = $1';
      const invParams = [line.sku_id];
      if (warehouseScope && warehouseScope.length > 0) {
        invSql += ' AND warehouse_id = ANY($2)';
        invParams.push(warehouseScope);
      } else if (warehouseScope && warehouseScope.length === 0) {
        throw Errors.scopeDenied();
      }
      invSql += ' FOR UPDATE';
      const invResult = await client.query(invSql, invParams);
      const totalAvailable = invResult.rows.reduce(
        (sum, r) => sum + r.available_qty - r.reserved_qty, 0
      );
      if (totalAvailable < line.quantity) {
        throw Errors.validation(`Insufficient inventory for SKU`, { sku_id: line.sku_id, available: totalAvailable, requested: line.quantity });
      }
    }

    const fingerprint = `${userId}:${cart.id}:${currentEstimate.grand_total}:${Date.now()}`;

    let orderResult;
    try {
      orderResult = await client.query(
        `INSERT INTO orders (cart_id, buyer_user_id, store_id, idempotency_key, order_fingerprint,
         status, total, handling_fee, tax, confirmed_drift)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $8, $9) RETURNING *`,
        [cart.id, userId, cart.store_id, data.idempotency_key, fingerprint,
         currentEstimate.grand_total, currentEstimate.handling_fee, currentEstimate.tax,
         data.confirmed_drift || false]
      );
    } catch (insertErr) {
      if (insertErr.code === '23505' && insertErr.constraint?.includes('idempotency_key')) {
        throw Errors.duplicate('Order already submitted with this idempotency key');
      }
      throw insertErr;
    }
    const order = orderResult.rows[0];

    for (const split of currentEstimate.splits) {
      for (const line of split.lines) {
        let remaining = line.quantity;
        const allocations = []; // Track all allocations for this line

        let allocSql = `SELECT id, warehouse_id, available_qty, reserved_qty FROM inventory
          WHERE sku_id = $1 AND available_qty - reserved_qty > 0`;
        const allocParams = [line.sku_id];
        if (warehouseScope && warehouseScope.length > 0) {
          allocSql += ' AND warehouse_id = ANY($2)';
          allocParams.push(warehouseScope);
        }
        allocSql += ' ORDER BY lot_number ASC NULLS LAST, id ASC FOR UPDATE';
        const invRows = await client.query(allocSql, allocParams);

        for (const inv of invRows.rows) {
          if (remaining <= 0) break;
          const canReserve = Math.min(remaining, inv.available_qty - inv.reserved_qty);
          if (canReserve <= 0) continue;

          const updateResult = await client.query(
            `UPDATE inventory SET reserved_qty = reserved_qty + $1, updated_at = NOW()
             WHERE id = $2 AND available_qty - reserved_qty >= $1`,
            [canReserve, inv.id]
          );
          if (updateResult.rowCount === 0) {
            throw Errors.validation('Inventory reservation conflict', { sku_id: line.sku_id });
          }
          allocations.push({ inventory_id: inv.id, warehouse_id: inv.warehouse_id, quantity: canReserve });
          remaining -= canReserve;
        }

        if (remaining > 0) {
          throw Errors.validation('Insufficient inventory for reservation', { sku_id: line.sku_id, shortfall: remaining });
        }

        // Determine primary warehouse from allocations (largest allocation)
        const primaryWarehouse = allocations.sort((a, b) => b.quantity - a.quantity)[0]?.warehouse_id;

        // Insert order line
        const olResult = await client.query(
          `INSERT INTO order_lines (order_id, sku_id, supplier_id, warehouse_id, quantity, unit_price, line_total, split_group)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [order.id, line.sku_id, line.supplier_id, primaryWarehouse, line.quantity, line.unit_price, line.line_total, split.supplier_id]
        );
        const orderLineId = olResult.rows[0].id;

        // Persist allocation provenance
        for (const alloc of allocations) {
          await client.query(
            `INSERT INTO order_line_allocations (order_line_id, inventory_id, warehouse_id, quantity)
             VALUES ($1, $2, $3, $4)`,
            [orderLineId, alloc.inventory_id, alloc.warehouse_id, alloc.quantity]
          );
        }
      }
    }

    await client.query("UPDATE carts SET status = 'checked_out', updated_at = NOW() WHERE id = $1", [cart.id]);

    await logAudit(userId, 'order_created', 'order', order.id,
      { total: currentEstimate.grand_total, drift: data.confirmed_drift }, null, client);

    return order;
  });
}
