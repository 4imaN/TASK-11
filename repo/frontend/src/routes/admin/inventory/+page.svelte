<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import ThresholdBadge from '../../../components/ThresholdBadge.svelte';
  import Toast from '../../../components/Toast.svelte';
  import { skuOptions as skuOptionsStore, loadSkuOptions } from '../../../stores/skus.js';

  let inventory = [];
  let warehouses = [];
  let loading = true;
  let toast = null;
  let warehouseFilter = '';

  let showCreateForm = false;
  let createForm = { sku_id: '', warehouse_id: '', lot_number: '', available_qty: 0, threshold_warning: 15, threshold_critical: 5 };

  let editingId = null;
  let editForm = { available_qty: 0, threshold_warning: 15, threshold_critical: 5 };

  let manualSkuEntry = false;

  onMount(async () => {
    try {
      const { cachedGet } = await import('$lib/offlineApi.js');
      const [inv, wh] = await Promise.all([
        cachedGet('/inventory?limit=50', 'admin_inventory'),
        cachedGet('/warehouses', 'warehouses', 10 * 60 * 1000),
      ]);
      inventory = inv.data || [];
      warehouses = wh.data || [];
      await loadSkuOptions();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    loading = false;
  });

  async function loadInventory() {
    loading = true;
    try {
      const url = warehouseFilter ? `/inventory?warehouse_id=${warehouseFilter}&limit=50` : '/inventory?limit=50';
      const data = await api.get(url);
      inventory = data.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    loading = false;
  }

  async function filterByWarehouse() {
    await loadInventory();
  }

  async function createInventory() {
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('post', '/inventory', {
        sku_id: createForm.sku_id,
        warehouse_id: createForm.warehouse_id,
        lot_number: createForm.lot_number || null,
        available_qty: parseInt(createForm.available_qty),
        threshold_warning: parseInt(createForm.threshold_warning),
        threshold_critical: parseInt(createForm.threshold_critical),
      });
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'Inventory record created', type: 'success' };
      }
      showCreateForm = false;
      createForm = { sku_id: '', warehouse_id: '', lot_number: '', available_qty: 0, threshold_warning: 15, threshold_critical: 5 };
      await loadInventory();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  function startEdit(inv) {
    editingId = inv.id;
    editForm = {
      available_qty: inv.available_qty,
      threshold_warning: inv.threshold_warning,
      threshold_critical: inv.threshold_critical,
    };
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit() {
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('put', `/inventory/${editingId}`, {
        available_qty: parseInt(editForm.available_qty),
        threshold_warning: parseInt(editForm.threshold_warning),
        threshold_critical: parseInt(editForm.threshold_critical),
      });
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'Inventory updated', type: 'success' };
      }
      editingId = null;
      await loadInventory();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }
</script>

<div class="flex-between mb-2">
  <h2>Inventory</h2>
  <button class="btn btn-primary" on:click={() => showCreateForm = !showCreateForm}>
    {showCreateForm ? 'Cancel' : '+ New Inventory Record'}
  </button>
</div>

{#if showCreateForm}
  <div class="card mb-2">
    <h3 style="margin-bottom: 1rem;">New Inventory Record</h3>
    <form on:submit|preventDefault={createInventory}>
      <div class="grid grid-3">
        <div class="form-group">
          <label for="create-inv-sku">SKU {manualSkuEntry ? '(manual)' : ''}</label>
          {#if manualSkuEntry}
            <input id="create-inv-sku" class="input" bind:value={createForm.sku_id} required placeholder="Enter SKU UUID" />
          {:else}
            <select id="create-inv-sku" class="input" bind:value={createForm.sku_id} required>
              <option value="">Select a SKU</option>
              {#each $skuOptionsStore as sku}
                <option value={sku.id}>{sku.sku_code} - {sku.spu_name}</option>
              {/each}
            </select>
          {/if}
          <button class="btn btn-sm" type="button" style="margin-top: 0.25rem; font-size: 0.75rem;" on:click={() => { manualSkuEntry = !manualSkuEntry; createForm.sku_id = ''; }}>
            {manualSkuEntry ? 'Use dropdown' : 'Enter manually'}
          </button>
        </div>
        <div class="form-group">
          <label for="create-inv-warehouse">Warehouse</label>
          <select id="create-inv-warehouse" class="input" bind:value={createForm.warehouse_id} required>
            <option value="">Select warehouse</option>
            {#each warehouses as wh}
              <option value={wh.id}>{wh.name} ({wh.code})</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label for="create-inv-lot">Lot Number</label>
          <input id="create-inv-lot" class="input" bind:value={createForm.lot_number} placeholder="Optional" />
        </div>
        <div class="form-group">
          <label for="create-inv-qty">Available Qty</label>
          <input id="create-inv-qty" class="input" type="number" bind:value={createForm.available_qty} min="0" required />
        </div>
        <div class="form-group">
          <label for="create-inv-warning">Warning Threshold</label>
          <input id="create-inv-warning" class="input" type="number" bind:value={createForm.threshold_warning} min="0" />
        </div>
        <div class="form-group">
          <label for="create-inv-critical">Critical Threshold</label>
          <input id="create-inv-critical" class="input" type="number" bind:value={createForm.threshold_critical} min="0" />
        </div>
      </div>
      <button class="btn btn-primary" type="submit">Create</button>
    </form>
  </div>
{/if}

<div class="card mb-2">
  <div class="flex gap-2">
    <select class="input" style="width: 250px;" bind:value={warehouseFilter} on:change={filterByWarehouse} aria-label="Filter by warehouse">
      <option value="">All warehouses</option>
      {#each warehouses as wh}
        <option value={wh.id}>{wh.name} ({wh.code})</option>
      {/each}
    </select>
  </div>
</div>

{#if loading}
  <div class="loading">Loading...</div>
{:else if inventory.length === 0}
  <div class="empty-state">No inventory records</div>
{:else}
  <table>
    <thead>
      <tr><th>SKU</th><th>Product</th><th>Warehouse</th><th>Lot</th><th>Available</th><th>Reserved</th><th>Status</th><th>Actions</th></tr>
    </thead>
    <tbody>
      {#each inventory as inv}
        <tr>
          <td class="text-sm" style="font-family: monospace;">{inv.sku_code}</td>
          <td>{inv.spu_name}</td>
          <td class="text-sm">{inv.warehouse_name} ({inv.warehouse_code})</td>
          <td class="text-sm">{inv.lot_number || '-'}</td>
          <td>{inv.available_qty}</td>
          <td>{inv.reserved_qty}</td>
          <td>
            <ThresholdBadge
              qty={inv.available_qty}
              reserved={inv.reserved_qty}
              warning={inv.threshold_warning}
              critical={inv.threshold_critical}
            />
          </td>
          <td>
            <button class="btn btn-sm" on:click={() => startEdit(inv)}>Edit</button>
          </td>
        </tr>
        {#if editingId === inv.id}
          <tr>
            <td colspan="8">
              <div class="card" style="margin: 0.5rem 0;">
                <h4 style="margin-bottom: 0.75rem;">Edit: {inv.sku_code}</h4>
                <form on:submit|preventDefault={saveEdit}>
                  <div class="grid grid-3">
                    <div class="form-group">
                      <label for="edit-inv-qty">Available Qty</label>
                      <input id="edit-inv-qty" class="input" type="number" bind:value={editForm.available_qty} min="0" required />
                    </div>
                    <div class="form-group">
                      <label for="edit-inv-warning">Warning Threshold</label>
                      <input id="edit-inv-warning" class="input" type="number" bind:value={editForm.threshold_warning} min="0" />
                    </div>
                    <div class="form-group">
                      <label for="edit-inv-critical">Critical Threshold</label>
                      <input id="edit-inv-critical" class="input" type="number" bind:value={editForm.threshold_critical} min="0" />
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <button class="btn btn-primary" type="submit">Save</button>
                    <button class="btn" type="button" on:click={cancelEdit}>Cancel</button>
                  </div>
                </form>
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
