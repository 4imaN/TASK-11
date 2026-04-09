import { writable } from 'svelte/store';
import { api } from '$lib/api.js';
import { draftGet, draftSet, draftClear } from '$lib/cache.js';

export const cart = writable({ cart: null, items: [] });
export const estimate = writable(null);
export const cartLoading = writable(false);

export async function loadCart() {
  cartLoading.set(true);
  try {
    const data = await api.get('/cart');
    cart.set(data.data);
    draftSet('cart', data.data);
  } catch {
    const cached = draftGet('cart');
    if (cached) {
      cart.set(cached);
    } else {
      cart.set({ cart: null, items: [] });
    }
  } finally {
    cartLoading.set(false);
  }
}

export async function addToCart(skuId, quantity, supplierId) {
  const data = await api.post('/cart/items', { sku_id: skuId, quantity, supplier_id: supplierId });
  cart.set(data.data);
  return data;
}

export async function updateCartItem(itemId, quantity) {
  const data = await api.put(`/cart/items/${itemId}`, { quantity });
  cart.set(data.data);
  return data;
}

export async function removeCartItem(itemId) {
  const data = await api.delete(`/cart/items/${itemId}`);
  cart.set(data.data);
  return data;
}

export async function computeEstimate() {
  const data = await api.post('/cart/estimate');
  estimate.set(data.data);
  return data.data;
}

export async function checkout(estimateId, idempotencyKey, confirmedDrift = false) {
  const result = await api.post('/cart/checkout', {
    estimate_id: estimateId,
    idempotency_key: idempotencyKey,
    confirmed_drift: confirmedDrift,
  });
  draftClear('cart');
  return result;
}
