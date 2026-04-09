<script>
  import { api } from '$lib/api.js';
  import { cachedGet } from '$lib/offlineApi.js';
  import { onMount } from 'svelte';
  import { addToCart } from '../../stores/cart.js';
  import ThresholdBadge from '../../components/ThresholdBadge.svelte';
  import Toast from '../../components/Toast.svelte';

  let spus = [];
  let categories = [];
  let search = '';
  let categoryFilter = '';
  let loading = true;
  let toast = null;
  let quantities = {};
  let selectedSkus = {};   // keyed by spu.id -> selected SKU id
  let spuSkuOptions = {};  // keyed by spu.id -> array of SKU objects
  let submitting = {};     // keyed by spu.id -> boolean, prevents duplicate submits

  onMount(loadData);

  async function loadData() {
    loading = true;
    try {
      const [spuData, catData] = await Promise.all([
        cachedGet(`/spus?status=published&search=${search}&category_id=${categoryFilter}&limit=50`, `spus_${search}_${categoryFilter}`),
        cachedGet('/categories?flat=true', 'categories'),
      ]);
      spus = spuData.data.items || [];
      categories = catData.data || [];
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    }
    loading = false;
  }

  function formatSpecCombination(spec) {
    if (!spec) return '';
    if (typeof spec === 'string') return spec;
    return Object.values(spec).join(', ');
  }

  async function addItem(spu) {
    if (submitting[spu.id]) return;
    submitting[spu.id] = true;
    submitting = submitting;
    try {
      // Fetch SPU detail to get all SKUs
      const skuData = await api.get(`/spus/${spu.id}`);
      const skus = skuData.data.skus || [];
      if (skus.length === 0) { toast = { message: 'No SKUs available', type: 'error' }; return; }

      if (skus.length === 1) {
        // Only 1 SKU, use it directly
        const qty = quantities[spu.id] || 12;
        await addToCart(skus[0].id, qty);
        toast = { message: `Added ${qty}x ${spu.name} to cart`, type: 'success' };
      } else {
        // Multiple SKUs: store them so the dropdown appears
        spuSkuOptions[spu.id] = skus;
        spuSkuOptions = spuSkuOptions; // trigger reactivity
        if (!selectedSkus[spu.id]) {
          selectedSkus[spu.id] = skus[0].id;
        }
      }
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    } finally {
      submitting[spu.id] = false;
      submitting = submitting;
    }
  }

  async function confirmAddItem(spu) {
    if (submitting[spu.id]) return;
    const skuId = selectedSkus[spu.id];
    if (!skuId) { toast = { message: 'Please select a variant', type: 'error' }; return; }
    submitting[spu.id] = true;
    submitting = submitting;
    const qty = quantities[spu.id] || 12;
    try {
      await addToCart(skuId, qty);
      toast = { message: `Added ${qty}x ${spu.name} to cart`, type: 'success' };
      // Clear the picker after successful add
      delete spuSkuOptions[spu.id];
      delete selectedSkus[spu.id];
      spuSkuOptions = spuSkuOptions;
      selectedSkus = selectedSkus;
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    } finally {
      submitting[spu.id] = false;
      submitting = submitting;
    }
  }
</script>

<h2 style="margin-bottom: 1.5rem;">Product Catalog</h2>

<div class="card mb-2">
  <div class="flex gap-2">
    <input class="input" style="width: 300px;" placeholder="Search products..." bind:value={search} on:input={loadData} />
    <select class="input" style="width: 200px;" bind:value={categoryFilter} on:change={loadData}>
      <option value="">All categories</option>
      {#each categories as cat}<option value={cat.id}>{cat.name}</option>{/each}
    </select>
  </div>
</div>

{#if loading}
  <div class="loading">Loading catalog...</div>
{:else if spus.length === 0}
  <div class="empty-state">No products available</div>
{:else}
  <div class="grid grid-3">
    {#each spus as spu}
      <div class="card">
        {#if spu.primary_image}
          <img src={spu.primary_image} alt={spu.name} style="width: 100%; height: 120px; object-fit: cover; border-radius: 4px; margin-bottom: 0.75rem;" />
        {:else}
          <div style="width: 100%; height: 120px; background: #f1f5f9; border-radius: 4px; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: center; color: var(--text-light);">No image</div>
        {/if}
        <h4>{spu.name}</h4>
        <p class="text-sm text-muted">{spu.category_name || ''}</p>
        {#if spu.tags}
          <div class="mt-1">
            {#each (Array.isArray(spu.tags) ? spu.tags : []) as tag}
              <span class="badge badge-draft">{tag}</span>
            {/each}
          </div>
        {/if}
        {#if spuSkuOptions[spu.id] && spuSkuOptions[spu.id].length > 1}
          <div class="mt-2" style="margin-bottom: 0.5rem;">
            <label class="text-sm" style="display: block; margin-bottom: 0.25rem;">Select variant:</label>
            <select class="input" style="width: 100%;" bind:value={selectedSkus[spu.id]}>
              {#each spuSkuOptions[spu.id] as sku}
                <option value={sku.id}>{sku.sku_code} - {formatSpecCombination(sku.spec_combination)}</option>
              {/each}
            </select>
          </div>
          <div class="flex gap-1" style="align-items: center;">
            <input class="input" type="number" style="width: 80px;" min="1"
              bind:value={quantities[spu.id]} placeholder="Qty" />
            <button class="btn btn-primary btn-sm" on:click={() => confirmAddItem(spu)} disabled={submitting[spu.id]}>{submitting[spu.id] ? 'Adding...' : 'Confirm Add'}</button>
          </div>
        {:else}
          <div class="flex gap-1 mt-2" style="align-items: center;">
            <input class="input" type="number" style="width: 80px;" min="1"
              bind:value={quantities[spu.id]} placeholder="Qty" />
            <button class="btn btn-primary btn-sm" on:click={() => addItem(spu)} disabled={submitting[spu.id]}>{submitting[spu.id] ? 'Adding...' : 'Add to Cart'}</button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
