import { writable } from 'svelte/store';
import { api } from '$lib/api.js';

export const skuOptions = writable([]);

let loaded = false;
export async function loadSkuOptions() {
  if (loaded) return;
  try {
    const res = await api.get('/spus?limit=200');
    const spus = res.data?.items || [];
    const options = [];
    for (const spu of spus) {
      const detail = await api.get(`/spus/${spu.id}`);
      for (const sku of (detail.data?.skus || [])) {
        options.push({ id: sku.id, sku_code: sku.sku_code, spu_name: spu.name, spec: sku.spec_combination });
      }
    }
    skuOptions.set(options);
    loaded = true;
  } catch {}
}
