import { describe, test, expect, beforeAll } from '@jest/globals';
import { loginAsBuyer, loginAsAdmin, clearSession, apiRequest } from './helpers.js';
import { resetCartFixtures, SKU_A, SKU_B, WH, PREFERRED_SUPPLIER } from './test_helpers.js';

describe('Cart, Checkout, Scope & Fulfillment', () => {
  beforeAll(resetCartFixtures);

  // ─── Cart basics ───
  test('add item with valid MOQ', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('POST', '/api/cart/items', { sku_id: SKU_A, quantity: 12 });
    expect(res.status).toBe(200);
    expect(res.data.data.items.length).toBeGreaterThan(0);
  });

  test('reject item with invalid pack size', async () => {
    const res = await apiRequest('POST', '/api/cart/items', { sku_id: SKU_A, quantity: 10 });
    expect(res.status).toBe(400);
    expect(res.data.error.code).toBe('VALIDATION');
  });

  test('estimate with supplier splitting', async () => {
    const res = await apiRequest('POST', '/api/cart/estimate');
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveProperty('splits');
    expect(res.data.data).toHaveProperty('grand_total');
    expect(res.data.data).toHaveProperty('estimate_id');
    expect(res.data.data.grand_total).toBeGreaterThan(0);
  });

  // ─── Checkout succeeds ───
  test('checkout succeeds with valid estimate', async () => {
    await resetCartFixtures();
    clearSession();
    await loginAsBuyer();
    const addRes = await apiRequest('POST', '/api/cart/items', { sku_id: SKU_A, quantity: 12 });
    expect(addRes.status).toBe(200);
    const est = await apiRequest('POST', '/api/cart/estimate');
    expect(est.status).toBe(200);
    const res = await apiRequest('POST', '/api/cart/checkout', {
      estimate_id: est.data.data.estimate_id,
      idempotency_key: `ck-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('confirmed');
  });

  // ─── Fulfillment provenance ───
  test('tasks have warehouse from allocation provenance', async () => {
    clearSession();
    await loginAsAdmin();
    const tasks = await apiRequest('GET', '/api/tasks?status=open&limit=50');
    expect(tasks.status).toBe(200);
    for (const task of tasks.data.data) {
      expect(task.warehouse_id).toBeTruthy();
    }
  });

  // ─── Idempotency ───
  test('duplicate idempotency key rejected', async () => {
    await resetCartFixtures();
    clearSession();
    await loginAsBuyer();
    await apiRequest('POST', '/api/cart/items', { sku_id: SKU_B, quantity: 12 });
    const est = await apiRequest('POST', '/api/cart/estimate');
    expect(est.status).toBe(200);
    const key = `dup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const first = await apiRequest('POST', '/api/cart/checkout', {
      estimate_id: est.data.data.estimate_id, idempotency_key: key,
    });
    expect(first.status).toBe(200);

    clearSession();
    await loginAsBuyer();
    await apiRequest('POST', '/api/cart/items', { sku_id: SKU_A, quantity: 12 });
    const est2 = await apiRequest('POST', '/api/cart/estimate');
    expect(est2.status).toBe(200);
    const dup = await apiRequest('POST', '/api/cart/checkout', {
      estimate_id: est2.data.data.estimate_id, idempotency_key: key,
    });
    expect(dup.status).toBe(409);
    expect(dup.data.error.code).toBe('DUPLICATE');
  });

  // ─── Validation ───
  test('checkout without estimate_id rejected', async () => {
    clearSession();
    await loginAsBuyer();
    await apiRequest('POST', '/api/cart/items', { sku_id: SKU_A, quantity: 12 });
    const res = await apiRequest('POST', '/api/cart/checkout', {
      idempotency_key: `noest-${Date.now()}`,
    });
    expect(res.status).toBe(400);
  });

  // ─── Inventory drift detection ───
  test('insufficient inventory after estimate triggers drift then hard failure on confirm', async () => {
    await resetCartFixtures();
    clearSession();

    // Add 12 items, estimate with 10000 available
    await loginAsBuyer();
    await apiRequest('POST', '/api/cart/items', { sku_id: SKU_A, quantity: 12 });
    const est = await apiRequest('POST', '/api/cart/estimate');
    expect(est.status).toBe(200);

    // Reduce inventory below requested (10000 → 8)
    clearSession();
    await loginAsAdmin();
    await apiRequest('POST', '/api/inventory', {
      sku_id: SKU_A, warehouse_id: WH, available_qty: 8, reserved_qty: 0,
    });

    // Checkout without confirm → inventory drift detected (99%+ change)
    clearSession();
    await loginAsBuyer();
    const ck = await apiRequest('POST', '/api/cart/checkout', {
      estimate_id: est.data.data.estimate_id,
      idempotency_key: `inv-insuf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    expect(ck.status).toBe(409);
    expect(ck.data.error.code).toBe('DRIFT_DETECTED');
    expect(ck.data.error.details).toHaveProperty('inventory_drift');

    // Confirm drift → still fails because stock is truly insufficient (hard 400)
    const confirmed = await apiRequest('POST', '/api/cart/checkout', {
      estimate_id: est.data.data.estimate_id,
      idempotency_key: `inv-insuf-ok-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      confirmed_drift: true,
    });
    expect(confirmed.status).toBe(400);

    // Cleanup
    clearSession();
    await loginAsAdmin();
    await apiRequest('POST', '/api/inventory', {
      sku_id: SKU_A, warehouse_id: WH, available_qty: 10000, reserved_qty: 0,
    });
  });

  test('inventory drift >2% triggers DRIFT_DETECTED even when stock is sufficient', async () => {
    await resetCartFixtures();
    clearSession();
    await loginAsBuyer();
    await apiRequest('POST', '/api/cart/items', { sku_id: SKU_A, quantity: 12 });
    const est = await apiRequest('POST', '/api/cart/estimate');
    expect(est.status).toBe(200);

    // Reduce inventory by >2% (from 10000 to 5000 = 50% change) but still above requested qty
    clearSession();
    await loginAsAdmin();
    await apiRequest('POST', '/api/inventory', {
      sku_id: SKU_A, warehouse_id: WH, available_qty: 5000, reserved_qty: 0,
    });

    // Checkout without confirm → inventory drift detected
    clearSession();
    await loginAsBuyer();
    const ck = await apiRequest('POST', '/api/cart/checkout', {
      estimate_id: est.data.data.estimate_id,
      idempotency_key: `inv-drift-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    expect(ck.status).toBe(409);
    expect(ck.data.error.code).toBe('DRIFT_DETECTED');
    expect(ck.data.error.details).toHaveProperty('inventory_drift');
    expect(ck.data.error.details.inventory_drift.length).toBeGreaterThan(0);

    // Checkout with confirmed_drift → success (stock is still sufficient)
    const confirmed = await apiRequest('POST', '/api/cart/checkout', {
      estimate_id: est.data.data.estimate_id,
      idempotency_key: `inv-drift-ok-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      confirmed_drift: true,
    });
    expect(confirmed.status).toBe(200);
  });

  test('price drift >2% triggers DRIFT_DETECTED then confirmed checkout succeeds', async () => {
    await resetCartFixtures();
    clearSession();
    await loginAsAdmin();
    const pricing = await apiRequest('GET', `/api/skus/${SKU_A}/suppliers`);
    expect(pricing.status).toBe(200);
    const entry = pricing.data.data.find(e => e.supplier_id === PREFERRED_SUPPLIER);
    expect(entry).toBeDefined();
    const origPrice = parseFloat(entry.unit_price);

    clearSession();
    await loginAsBuyer();
    await apiRequest('POST', '/api/cart/items', { sku_id: SKU_A, quantity: 12 });
    const est = await apiRequest('POST', '/api/cart/estimate');
    expect(est.status).toBe(200);

    clearSession();
    await loginAsAdmin();
    await apiRequest('PUT', `/api/sku-suppliers/${entry.id}`, { unit_price: origPrice * 3 });

    try {
      clearSession();
      await loginAsBuyer();
      const ck = await apiRequest('POST', '/api/cart/checkout', {
        estimate_id: est.data.data.estimate_id,
        idempotency_key: `drift-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      expect(ck.status).toBe(409);
      expect(ck.data.error.code).toBe('DRIFT_DETECTED');
      expect(ck.data.error.details).toHaveProperty('drift_detected', true);
      expect(ck.data.error.details.drift_pct).toBeGreaterThan(2);

      const confirmed = await apiRequest('POST', '/api/cart/checkout', {
        estimate_id: est.data.data.estimate_id,
        idempotency_key: `drift-ok-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        confirmed_drift: true,
      });
      expect(confirmed.status).toBe(200);
      expect(confirmed.data.data.status).toBe('confirmed');
    } finally {
      clearSession();
      await loginAsAdmin();
      await apiRequest('PUT', `/api/sku-suppliers/${entry.id}`, { unit_price: origPrice });
    }
  });
});
