import { loginAsAdmin, loginAsBuyer, clearSession, apiRequest } from './helpers.js';

export const SKU_A = '14000000-0000-0000-0000-000000000001';
export const SKU_B = '14000000-0000-0000-0000-000000000002';
export const WH = 'c0000000-0000-0000-0000-000000000001';
export const PREFERRED_SUPPLIER = '12000000-0000-0000-0000-000000000001';

/**
 * Deterministic fixture reset: canonical prices + inventory.
 * Cart cleanup is unnecessary because getOrCreateCart now matches by store_id,
 * so stale carts from prior tests are automatically bypassed.
 */
export async function resetCartFixtures() {
  clearSession();
  await loginAsAdmin();
  // Restore canonical prices
  for (const [sku, price] of [[SKU_A, 2.50], [SKU_B, 3.00]]) {
    const p = await apiRequest('GET', `/api/skus/${sku}/suppliers`);
    if (p.status === 200) {
      for (const e of p.data.data) {
        if (e.supplier_id === PREFERRED_SUPPLIER) {
          await apiRequest('PUT', `/api/sku-suppliers/${e.id}`, { unit_price: price });
        }
      }
    }
  }
  // Reset inventory
  for (const sku of [SKU_A, SKU_B, '14000000-0000-0000-0000-000000000003']) {
    await apiRequest('POST', '/api/inventory', {
      sku_id: sku, warehouse_id: WH, available_qty: 10000, reserved_qty: 0,
    });
  }
  // Empty buyer's active cart
  clearSession();
  await loginAsBuyer();
  const cart = await apiRequest('GET', '/api/cart');
  for (const item of (cart.data?.data?.items || [])) {
    await apiRequest('DELETE', `/api/cart/items/${item.id}`);
  }
  clearSession();
}
