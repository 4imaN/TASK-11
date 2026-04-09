<script>
  import { api } from '$lib/api.js';
  import { cachedGet } from '$lib/offlineApi.js';
  import { onMount } from 'svelte';
  import Toast from '../../../components/Toast.svelte';
  import { skuOptions as skuOptionsStore, loadSkuOptions } from '../../../stores/skus.js';

  let suppliers = [];
  let loading = true;
  let toast = null;
  let showCreate = false;
  let submitting = false;
  let form = { name: '', contact_info: { phone: '', email: '' } };

  // SKU-Supplier pricing state
  let expandedSupplierId = null;
  let pricingEntries = [];
  let pricingLoading = false;
  let showAddPricing = false;
  let pricingForm = { sku_id: '', unit_price: '', moq: 1, pack_size: 1, is_preferred: false, is_taxable: false };
  let manualSkuEntry = false;

  // Inline edit state for pricing
  let editingPricingId = null;
  let editPricingForm = { unit_price: '', moq: 1, pack_size: 1, is_preferred: false, is_taxable: false };

  onMount(loadData);

  async function loadData() {
    loading = true;
    try {
      const data = await cachedGet('/suppliers?limit=50', 'supplier-list');
      suppliers = data.data || [];
      await loadSkuOptions();
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    } finally {
      loading = false;
    }
  }

  async function create() {
    submitting = true;
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('post', '/suppliers', form);
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'Supplier created', type: 'success' };
      }
      showCreate = false;
      form = { name: '', contact_info: { phone: '', email: '' } };
      await loadData();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    finally { submitting = false; }
  }

  async function archive(id) {
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('patch', `/suppliers/${id}/status`, { status: 'archived' });
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'Supplier archived', type: 'success' };
      }
      await loadData();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  async function togglePricing(supplierId) {
    if (expandedSupplierId === supplierId) {
      expandedSupplierId = null;
      pricingEntries = [];
      showAddPricing = false;
      return;
    }
    expandedSupplierId = supplierId;
    showAddPricing = false;
    await loadPricing(supplierId);
  }

  async function loadPricing(supplierId) {
    pricingLoading = true;
    try {
      const res = await api.get(`/suppliers/${supplierId}/skus`);
      pricingEntries = res.data || [];
    } catch (err) {
      pricingEntries = [];
      toast = { message: err.message, type: 'error' };
    } finally {
      pricingLoading = false;
    }
  }

  async function addPricing() {
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('post', `/skus/${pricingForm.sku_id}/suppliers`, {
        supplier_id: expandedSupplierId,
        unit_price: parseFloat(pricingForm.unit_price),
        moq: parseInt(pricingForm.moq),
        pack_size: parseInt(pricingForm.pack_size),
        is_preferred: pricingForm.is_preferred,
        is_taxable: pricingForm.is_taxable,
      });
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'Pricing entry added', type: 'success' };
      }
      showAddPricing = false;
      pricingForm = { sku_id: '', unit_price: '', moq: 1, pack_size: 1, is_preferred: false, is_taxable: false };
      await loadPricing(expandedSupplierId);
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  function startEditPricing(p) {
    editingPricingId = p.id;
    editPricingForm = {
      unit_price: p.unit_price,
      moq: p.moq,
      pack_size: p.pack_size,
      is_preferred: p.is_preferred,
      is_taxable: p.is_taxable,
    };
  }

  function cancelEditPricing() {
    editingPricingId = null;
  }

  async function saveEditPricing() {
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('put', `/sku-suppliers/${editingPricingId}`, {
        unit_price: parseFloat(editPricingForm.unit_price),
        moq: parseInt(editPricingForm.moq),
        pack_size: parseInt(editPricingForm.pack_size),
        is_preferred: editPricingForm.is_preferred,
        is_taxable: editPricingForm.is_taxable,
      });
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'Pricing updated', type: 'success' };
      }
      editingPricingId = null;
      await loadPricing(expandedSupplierId);
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  async function deactivatePricing(pricingId) {
    if (!confirm('Deactivate this pricing entry?')) return;
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('delete', `/sku-suppliers/${pricingId}`);
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'Pricing entry deactivated', type: 'success' };
      }
      await loadPricing(expandedSupplierId);
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }
</script>

<div class="flex-between mb-2">
  <h2>Suppliers</h2>
  <button class="btn btn-primary" on:click={() => showCreate = !showCreate}>
    {showCreate ? 'Cancel' : '+ New Supplier'}
  </button>
</div>

{#if showCreate}
  <div class="card mb-2">
    <form on:submit|preventDefault={create}>
      <div class="grid grid-3">
        <div class="form-group"><label for="supplier-name">Name</label><input id="supplier-name" class="input" bind:value={form.name} required /></div>
        <div class="form-group"><label for="supplier-phone">Phone</label><input id="supplier-phone" class="input" bind:value={form.contact_info.phone} /></div>
        <div class="form-group"><label for="supplier-email">Email</label><input id="supplier-email" class="input" bind:value={form.contact_info.email} /></div>
      </div>
      <button class="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</button>
    </form>
  </div>
{/if}

{#if loading}
  <div class="loading">Loading...</div>
{:else}
  <table>
    <thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>
      {#each suppliers as s}
        <tr>
          <td>{s.name}</td>
          <td class="text-sm">{s.contact_info?.email || ''} {s.contact_info?.phone || ''}</td>
          <td><span class="badge badge-{s.status === 'active' ? 'published' : 'failed'}">{s.status}</span></td>
          <td>
            <div class="flex gap-1">
              <button class="btn btn-sm" on:click={() => togglePricing(s.id)}>
                {expandedSupplierId === s.id ? 'Hide Pricing' : 'Manage Pricing'}
              </button>
              {#if s.status === 'active'}
                <button class="btn btn-sm btn-danger" on:click={() => archive(s.id)}>Archive</button>
              {/if}
            </div>
          </td>
        </tr>
        {#if expandedSupplierId === s.id}
          <tr>
            <td colspan="4">
              <div class="card" style="margin: 0.5rem 0;">
                <div class="flex-between mb-2">
                  <h4>SKU-Supplier Pricing for {s.name}</h4>
                  <button class="btn btn-sm btn-primary" on:click={() => showAddPricing = !showAddPricing}>
                    {showAddPricing ? 'Cancel' : '+ Add Pricing'}
                  </button>
                </div>

                {#if showAddPricing}
                  <form on:submit|preventDefault={addPricing} style="margin-bottom: 1rem;">
                    <div class="grid grid-3">
                      <div class="form-group">
                        <label for="pricing-sku">SKU {manualSkuEntry ? '(manual)' : ''}</label>
                        {#if manualSkuEntry}
                          <input id="pricing-sku" class="input" bind:value={pricingForm.sku_id} required placeholder="Enter SKU UUID" />
                        {:else}
                          <select id="pricing-sku" class="input" bind:value={pricingForm.sku_id} required>
                            <option value="">Select a SKU</option>
                            {#each $skuOptionsStore as sku}
                              <option value={sku.id}>{sku.sku_code} - {sku.spu_name}</option>
                            {/each}
                          </select>
                        {/if}
                        <button class="btn btn-sm" type="button" style="margin-top: 0.25rem; font-size: 0.75rem;" on:click={() => { manualSkuEntry = !manualSkuEntry; pricingForm.sku_id = ''; }}>
                          {manualSkuEntry ? 'Use dropdown' : 'Enter manually'}
                        </button>
                      </div>
                      <div class="form-group">
                        <label for="pricing-unit-price">Unit Price</label>
                        <input id="pricing-unit-price" class="input" type="number" step="0.01" bind:value={pricingForm.unit_price} required />
                      </div>
                      <div class="form-group">
                        <label for="pricing-moq">MOQ</label>
                        <input id="pricing-moq" class="input" type="number" bind:value={pricingForm.moq} min="1" />
                      </div>
                      <div class="form-group">
                        <label for="pricing-pack-size">Pack Size</label>
                        <input id="pricing-pack-size" class="input" type="number" bind:value={pricingForm.pack_size} min="1" />
                      </div>
                      <div class="form-group" style="display:flex;align-items:center;gap:1rem;padding-top:1.5rem;">
                        <label><input type="checkbox" bind:checked={pricingForm.is_preferred} /> Preferred</label>
                        <label><input type="checkbox" bind:checked={pricingForm.is_taxable} /> Taxable</label>
                      </div>
                    </div>
                    <button class="btn btn-primary" type="submit">Add Pricing</button>
                  </form>
                {/if}

                {#if pricingLoading}
                  <div class="loading">Loading pricing...</div>
                {:else if pricingEntries.length === 0}
                  <div class="text-sm text-muted">No pricing entries for this supplier</div>
                {:else}
                  <table>
                    <thead>
                      <tr><th>SKU</th><th>Unit Price</th><th>MOQ</th><th>Pack Size</th><th>Preferred</th><th>Taxable</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {#each pricingEntries as p}
                        {#if editingPricingId === p.id}
                          <tr>
                            <td class="text-sm" style="font-family: monospace;">{p.sku_code || p.sku_id}</td>
                            <td><input class="input" type="number" step="0.01" style="width: 90px;" bind:value={editPricingForm.unit_price} /></td>
                            <td><input class="input" type="number" style="width: 70px;" bind:value={editPricingForm.moq} min="1" /></td>
                            <td><input class="input" type="number" style="width: 70px;" bind:value={editPricingForm.pack_size} min="1" /></td>
                            <td><input type="checkbox" bind:checked={editPricingForm.is_preferred} /></td>
                            <td><input type="checkbox" bind:checked={editPricingForm.is_taxable} /></td>
                            <td>
                              <div class="flex gap-1">
                                <button class="btn btn-sm btn-primary" on:click={saveEditPricing}>Save</button>
                                <button class="btn btn-sm" on:click={cancelEditPricing}>Cancel</button>
                              </div>
                            </td>
                          </tr>
                        {:else}
                          <tr>
                            <td class="text-sm" style="font-family: monospace;">{p.sku_code || p.sku_id}</td>
                            <td>${parseFloat(p.unit_price).toFixed(2)}</td>
                            <td>{p.moq}</td>
                            <td>{p.pack_size}</td>
                            <td>{p.is_preferred ? 'Yes' : 'No'}</td>
                            <td>{p.is_taxable ? 'Yes' : 'No'}</td>
                            <td>
                              <div class="flex gap-1">
                                <button class="btn btn-sm" on:click={() => startEditPricing(p)}>Edit</button>
                                <button class="btn btn-sm btn-danger" on:click={() => deactivatePricing(p.id)}>Deactivate</button>
                              </div>
                            </td>
                          </tr>
                        {/if}
                      {/each}
                    </tbody>
                  </table>
                {/if}
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
