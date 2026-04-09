<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import SeatGrid from '../../../components/SeatGrid.svelte';
  import HoldCountdown from '../../../components/HoldCountdown.svelte';
  import Toast from '../../../components/Toast.svelte';

  let inventoryList = [];
  let selectedInventory = '';
  let slots = [];
  let selectedSlotIds = [];
  let activeHold = null;
  let toast = null;
  let loading = false;
  let error = null;
  let submitting = false;

  onMount(async () => {
    try {
      const data = await api.get('/inventory?limit=50');
      inventoryList = data.data || [];
    } catch (err) {
      error = err.message || 'Failed to load inventory';
    }
  });

  async function loadSlots() {
    if (!selectedInventory) return;
    loading = true;
    try {
      const data = await api.get(`/constrained-slots?inventory_id=${selectedInventory}`);
      slots = data.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    loading = false;
  }

  async function createHold() {
    if (selectedSlotIds.length === 0 || submitting) return;
    submitting = true;
    try {
      const key = `hold-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const data = await api.post('/holds', { slot_ids: selectedSlotIds, client_request_key: key });
      activeHold = data.data;
      toast = { message: `Hold created for ${selectedSlotIds.length} slots`, type: 'success' };
      selectedSlotIds = [];
      await loadSlots();
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    } finally { submitting = false; }
  }

  async function cancelHold() {
    if (!activeHold || submitting) return;
    submitting = true;
    try {
      await api.delete(`/holds/${activeHold.hold.id}`);
      toast = { message: 'Hold cancelled', type: 'success' };
      activeHold = null;
      await loadSlots();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    finally { submitting = false; }
  }

  async function commitHold() {
    if (!activeHold || submitting) return;
    submitting = true;
    try {
      const key = `order-hold-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await api.post(`/holds/${activeHold.hold.id}/checkout`, { idempotency_key: key });
      toast = { message: 'Reservation confirmed!', type: 'success' };
      activeHold = null;
      await loadSlots();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    finally { submitting = false; }
  }

  function onHoldExpired() {
    activeHold = null;
    toast = { message: 'Hold expired', type: 'warning' };
    loadSlots();
  }
</script>

<h2 style="margin-bottom: 1.5rem;">Seat-Style Inventory Holds</h2>

{#if error}
  <div class="card mb-2" style="background: #fecaca; border-color: var(--danger); color: #991b1b;">
    <strong>Error:</strong> {error}
  </div>
{/if}

<div class="card mb-2">
  <div class="form-group">
    <label for="hold-inventory-select">Select Inventory</label>
    <select id="hold-inventory-select" class="input" style="width: 400px;" bind:value={selectedInventory} on:change={loadSlots}>
      <option value="">Choose inventory record...</option>
      {#each inventoryList as inv}
        <option value={inv.id}>{inv.spu_name} - {inv.sku_code} ({inv.warehouse_name})</option>
      {/each}
    </select>
  </div>
</div>

{#if activeHold}
  <div class="card mb-2" style="background: #eff6ff; border-color: var(--primary);">
    <div class="flex-between">
      <div>
        <strong>Active Hold</strong>
        <span class="text-sm text-muted ml-2">({activeHold.slots?.length || 0} slots)</span>
      </div>
      <HoldCountdown expiresAt={activeHold.hold.expires_at} onExpired={onHoldExpired} />
    </div>
    <div class="flex gap-2 mt-2">
      <button class="btn btn-primary" on:click={commitHold} disabled={submitting}>{submitting ? 'Processing...' : 'Confirm Reservation'}</button>
      <button class="btn btn-danger" on:click={cancelHold} disabled={submitting}>{submitting ? 'Processing...' : 'Cancel Hold'}</button>
    </div>
  </div>
{/if}

{#if loading}
  <div class="loading">Loading slots...</div>
{:else if slots.length > 0}
  <div class="card">
    <h3 style="margin-bottom: 1rem;">Select Seats/Slots</h3>
    <SeatGrid {slots} bind:selectedIds={selectedSlotIds} onSelect={(ids) => selectedSlotIds = ids} />

    {#if selectedSlotIds.length > 0}
      <div class="flex-between mt-2">
        <span class="text-sm">{selectedSlotIds.length} slot(s) selected</span>
        <button class="btn btn-primary" on:click={createHold} disabled={submitting}>{submitting ? 'Placing hold...' : 'Place Hold (10 min)'}</button>
      </div>
    {/if}
  </div>
{:else if selectedInventory}
  <div class="empty-state">No constrained slots for this inventory</div>
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
