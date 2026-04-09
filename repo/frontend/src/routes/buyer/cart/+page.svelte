<script>
  import { onMount } from 'svelte';
  import { cart, loadCart, updateCartItem, removeCartItem, computeEstimate, checkout, estimate } from '../../../stores/cart.js';
  import Toast from '../../../components/Toast.svelte';

  let toast = null;
  let estimateData = null;
  let checkingOut = false;
  let driftInfo = null;
  let estimateStale = false;
  let autoEstimateTimer = null;

  function scheduleEstimate() {
    if (autoEstimateTimer) clearTimeout(autoEstimateTimer);
    autoEstimateTimer = setTimeout(async () => {
      if ($cart.items.length > 0) {
        await getEstimate();
      }
    }, 800);
  }

  onMount(loadCart);

  async function getEstimate() {
    try {
      estimateData = await computeEstimate();
      estimateStale = false;
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  async function doCheckout(confirmDrift = false) {
    checkingOut = true;
    driftInfo = null;
    try {
      const key = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await checkout(estimateData?.estimate_id, key, confirmDrift);
      toast = { message: 'Order placed successfully!', type: 'success' };
      estimateData = null;
      await loadCart();
    } catch (err) {
      if (err.code === 'DRIFT_DETECTED') {
        driftInfo = err.details;
        toast = { message: 'Price/inventory changed — please confirm', type: 'warning' };
      } else if (err.code === 'DUPLICATE') {
        toast = { message: 'Order already submitted', type: 'warning' };
      } else {
        toast = { message: err.message, type: 'error' };
      }
    } finally { checkingOut = false; }
  }

  async function updateQty(itemId, qty) {
    try {
      await updateCartItem(itemId, qty);
      if (estimateData) estimateStale = true;
      scheduleEstimate();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  async function remove(itemId) {
    try {
      await removeCartItem(itemId);
      if (estimateData) estimateStale = true;
      scheduleEstimate();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }
</script>

<h2 style="margin-bottom: 1.5rem;">Shopping Cart</h2>

{#if $cart.items.length === 0}
  <div class="empty-state">Your cart is empty. <a href="/buyer">Browse catalog</a></div>
{:else}
  <div class="card mb-2">
    <table>
      <thead><tr><th>Product</th><th>SKU</th><th>Supplier</th><th>Qty</th><th>Unit Price</th><th>Actions</th></tr></thead>
      <tbody>
        {#each $cart.items as item}
          <tr>
            <td>{item.spu_name}</td>
            <td class="text-sm" style="font-family: monospace;">{item.sku_code}</td>
            <td class="text-sm">{item.supplier_name || 'Auto'}</td>
            <td>
              <input class="input" type="number" style="width: 80px;" value={item.quantity} min="1"
                on:change={(e) => updateQty(item.id, parseInt(e.target.value))} />
            </td>
            <td>${item.unit_price_snapshot}</td>
            <td><button class="btn btn-sm btn-danger" on:click={() => remove(item.id)}>Remove</button></td>
          </tr>
        {/each}
      </tbody>
    </table>

    <div class="text-right mt-2">
      {#if estimateStale}
        <span class="text-sm" style="color: var(--warning); margin-right: 0.75rem;">Estimate may be outdated after cart changes</span>
      {/if}
      <button class="btn btn-primary" on:click={getEstimate}>Calculate Estimate</button>
    </div>
  </div>

  {#if estimateData}
    <div class="card mb-2">
      <h3 style="margin-bottom: 1rem;">Order Estimate</h3>
      {#each estimateData.splits as split}
        <div class="card" style="background: #f8fafc;">
          <strong>{split.supplier_name}</strong>
          <table>
            <thead><tr><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
            <tbody>
              {#each split.lines as line}
                <tr>
                  <td class="text-sm">{line.sku_id.substring(0, 8)}</td>
                  <td>{line.quantity}</td>
                  <td>${line.unit_price.toFixed(2)}</td>
                  <td>${line.line_total.toFixed(2)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="text-right text-sm mt-1">
            Subtotal: ${split.subtotal.toFixed(2)} | Handling: ${split.handling_fee.toFixed(2)} | Tax: ${split.tax.toFixed(2)} | <strong>Total: ${split.total.toFixed(2)}</strong>
          </div>
        </div>
      {/each}

      <div class="text-right" style="font-size: 1.25rem; font-weight: 700; margin-top: 1rem;">
        Grand Total: ${estimateData.grand_total.toFixed(2)}
      </div>

      <div class="text-right mt-2">
        <button class="btn btn-primary" on:click={() => doCheckout()} disabled={checkingOut || estimateStale}>
          {checkingOut ? 'Placing order...' : estimateStale ? 'Estimate outdated — recalculating...' : 'Place Order'}
        </button>
      </div>
    </div>
  {/if}

  {#if driftInfo}
    <div class="card" style="background: #fef3c7; border-color: #fcd34d;">
      <h3>Price/Inventory Change Detected</h3>
      <p class="mt-1">The order total has changed by <strong>{driftInfo.drift_pct}%</strong></p>
      <p>Old total: <strong>${driftInfo.old_total?.toFixed(2)}</strong> → New total: <strong>${driftInfo.new_total?.toFixed(2)}</strong></p>

      {#if driftInfo.line_changes}
        <table class="mt-2">
          <thead><tr><th>SKU</th><th>Old Price</th><th>New Price</th></tr></thead>
          <tbody>
            {#each driftInfo.line_changes as change}
              <tr>
                <td class="text-sm">{change.sku_id?.substring(0, 8)}</td>
                <td>${change.old_price}</td>
                <td>${change.new_price}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      {#if driftInfo.inventory_drift}
        <div class="mt-1">
          <strong>Inventory changes:</strong>
          {#each driftInfo.inventory_drift as inv}
            <div class="text-sm">
              SKU {inv.sku_id.substring(0,8)}: was {inv.estimated_available} units, now {inv.current_available} ({inv.drift_pct}% change)
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex gap-2 mt-2">
        <button class="btn btn-primary" on:click={() => doCheckout(true)} disabled={checkingOut}>{checkingOut ? 'Placing order...' : 'Confirm and Place Order'}</button>
        <button class="btn" on:click={() => driftInfo = null}>Cancel</button>
      </div>
    </div>
  {/if}
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
