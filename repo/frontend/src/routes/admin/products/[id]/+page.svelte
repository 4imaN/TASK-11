<script>
  import { api } from '$lib/api.js';
  import { cachedGet } from '$lib/offlineApi.js';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import Toast from '../../../../components/Toast.svelte';

  let spu = null;
  let loading = true;
  let toast = null;
  let editing = false;
  let editForm = {};

  let showNewSku = false;
  let skuForm = { sku_code: '', spec_combination: '{}' };

  // Image management
  let images = [];
  let newImage = { image_url: '', is_primary: false, sort_order: 0 };

  // Categories and tags for editing
  let categories = [];
  let allTags = [];

  // Editable tags and spec attributes
  let editTags = [];
  let editSpecAttributes = [];
  let newSpecName = '';
  let newSpecValues = '';

  // SKU editing
  let editingSku = null;
  let skuEditForm = {};

  $: spuId = $page.params.id;

  onMount(loadSpu);

  async function loadSpu() {
    loading = true;
    try {
      const [spuRes, catRes, tagRes] = await Promise.all([
        cachedGet(`/spus/${spuId}`, `spu-detail-${spuId}`),
        cachedGet('/categories?flat=true', 'categories_flat', 10 * 60 * 1000),
        cachedGet('/tags', 'tags', 10 * 60 * 1000),
      ]);
      spu = spuRes.data;
      categories = catRes.data || [];
      allTags = tagRes.data || [];
      images = (spu.images || []).map(img => ({ ...img }));
      editTags = (spu.tags || []).map(t => typeof t === 'string' ? t : t.id);
      editSpecAttributes = (spu.spec_attributes || []).map(s => ({ name: s.name, values: Array.isArray(s.values) ? [...s.values] : [] }));
      editForm = {
        name: spu.name,
        description: spu.description || '',
        category_id: spu.category_id || '',
      };
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    } finally {
      loading = false;
    }
  }

  function addImage() {
    if (!newImage.image_url) {
      toast = { message: 'Image URL is required', type: 'error' };
      return;
    }
    images = [...images, { ...newImage }];
    newImage = { image_url: '', is_primary: false, sort_order: images.length };
  }

  function removeImage(index) {
    images = images.filter((_, i) => i !== index);
  }

  function setAsPrimary(index) {
    images = images.map((img, i) => ({ ...img, is_primary: i === index }));
  }

  function addSpec() {
    if (newSpecName && newSpecValues) {
      editSpecAttributes = [...editSpecAttributes, {
        name: newSpecName,
        values: newSpecValues.split(',').map(v => v.trim()),
      }];
      newSpecName = '';
      newSpecValues = '';
    }
  }

  function removeSpec(index) {
    editSpecAttributes = editSpecAttributes.filter((_, i) => i !== index);
  }

  async function saveSpu() {
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('put', `/spus/${spuId}`, {
        ...editForm,
        images,
        tags: editTags,
        spec_attributes: editSpecAttributes,
      });
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'Product updated', type: 'success' };
      }
      editing = false;
      await loadSpu();
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    }
  }

  async function toggleStatus(newStatus) {
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('patch', `/spus/${spuId}/status`, { status: newStatus });
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: `Product ${newStatus}`, type: 'success' };
      }
      await loadSpu();
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    }
  }

  async function createSku() {
    try {
      let specObj;
      try {
        specObj = JSON.parse(skuForm.spec_combination);
      } catch {
        toast = { message: 'Invalid JSON for spec combination', type: 'error' };
        return;
      }
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('post', `/spus/${spuId}/skus`, {
        sku_code: skuForm.sku_code,
        spec_combination: specObj,
      });
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'SKU created', type: 'success' };
      }
      showNewSku = false;
      skuForm = { sku_code: '', spec_combination: '{}' };
      await loadSpu();
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    }
  }

  function startEditSku(sku) {
    editingSku = sku.id;
    skuEditForm = {
      spec_combination: JSON.stringify(sku.spec_combination || {}, null, 2),
      status: sku.status,
    };
  }

  function cancelEditSku() {
    editingSku = null;
    skuEditForm = {};
  }

  async function saveSku(skuId) {
    try {
      let specObj;
      try {
        specObj = JSON.parse(skuEditForm.spec_combination);
      } catch {
        toast = { message: 'Invalid JSON for spec combination', type: 'error' };
        return;
      }
      await api.put(`/skus/${skuId}`, { spec_combination: specObj });
      toast = { message: 'SKU updated', type: 'success' };
      editingSku = null;
      await loadSpu();
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    }
  }

  async function changeSkuStatus(skuId, newStatus) {
    try {
      await api.patch(`/skus/${skuId}/status`, { status: newStatus });
      toast = { message: `SKU ${newStatus}`, type: 'success' };
      await loadSpu();
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    }
  }
</script>

{#if loading}
  <div class="loading">Loading product...</div>
{:else if !spu}
  <div class="empty-state">Product not found</div>
{:else}
  <div class="flex-between mb-2">
    <h2>{spu.name}</h2>
    <div class="flex gap-1">
      <a href="/admin/products" class="btn btn-sm">Back to Products</a>
      {#if !editing}
        <button class="btn btn-sm btn-primary" on:click={() => editing = true}>Edit</button>
      {/if}
      {#if spu.status === 'draft' || spu.status === 'unpublished'}
        <button class="btn btn-sm btn-primary" on:click={() => toggleStatus('published')}>Publish</button>
      {/if}
      {#if spu.status === 'published'}
        <button class="btn btn-sm" on:click={() => toggleStatus('unpublished')}>Unpublish</button>
      {/if}
    </div>
  </div>

  {#if editing}
    <div class="card mb-2">
      <h3 style="margin-bottom: 1rem;">Edit Product</h3>
      <form on:submit|preventDefault={saveSpu}>
        <div class="grid grid-2">
          <div class="form-group">
            <label for="edit-product-name">Name</label>
            <input id="edit-product-name" class="input" bind:value={editForm.name} required />
          </div>
          <div class="form-group">
            <label for="edit-product-category">Category</label>
            <select id="edit-product-category" class="input" bind:value={editForm.category_id}>
              <option value="">No category</option>
              {#each categories as cat}
                <option value={cat.id}>{cat.name}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="edit-product-description">Description</label>
          <textarea id="edit-product-description" class="input" bind:value={editForm.description} rows="3"></textarea>
        </div>

        <!-- Tags -->
        <div class="form-group">
          <label>Tags</label>
          <div class="flex gap-1" style="flex-wrap: wrap;">
            {#each allTags as tag}
              <label style="font-size: 0.85rem;">
                <input type="checkbox" value={tag.id}
                  checked={editTags.includes(tag.id)}
                  on:change={(e) => {
                    if (e.target.checked) editTags = [...editTags, tag.id];
                    else editTags = editTags.filter(t => t !== tag.id);
                  }} />
                {tag.name}
              </label>
            {/each}
          </div>
        </div>

        <!-- Spec Attributes -->
        <div class="form-group">
          <label>Spec Attributes</label>
          {#if editSpecAttributes.length > 0}
            <div class="mb-1">
              {#each editSpecAttributes as spec, i}
                <span class="badge badge-published" style="margin-right: 0.5rem;">
                  {spec.name}: {spec.values.join(', ')}
                  <button type="button" style="background:none;border:none;cursor:pointer;color:inherit;font-weight:bold;margin-left:0.25rem;" on:click={() => removeSpec(i)}>x</button>
                </span>
              {/each}
            </div>
          {/if}
          <div class="flex gap-1">
            <input class="input" placeholder="Name (e.g. strength)" bind:value={newSpecName} style="width: 200px;" />
            <input class="input" placeholder="Values (comma-separated)" bind:value={newSpecValues} style="flex:1;" />
            <button class="btn" type="button" on:click={addSpec}>Add</button>
          </div>
        </div>

        <!-- Image Management -->
        <div style="margin-bottom: 1rem;">
          <h4 style="margin-bottom: 0.5rem;">Images</h4>

          {#if images.length > 0}
            <div class="flex gap-1 mb-2" style="flex-wrap: wrap;">
              {#each images as img, i}
                <div style="border: 1px solid var(--border); border-radius: 8px; overflow: hidden; width: 160px;">
                  <img src={img.image_url} alt={img.alt_text || ''} style="width: 100%; height: 80px; object-fit: cover;" />
                  <div style="padding: 0.25rem; font-size: 0.75rem;">
                    <div>{img.is_primary ? 'Primary' : `Sort: ${img.sort_order ?? ''}`}</div>
                    <div class="flex gap-1" style="margin-top: 0.25rem;">
                      {#if !img.is_primary}
                        <button class="btn btn-sm" type="button" on:click={() => setAsPrimary(i)}>Set as Primary</button>
                      {/if}
                      <button class="btn btn-sm btn-danger" type="button" on:click={() => removeImage(i)}>Remove</button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <div style="border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; background: var(--bg-secondary, #f9f9f9);">
            <strong style="font-size: 0.875rem;">Add Image</strong>
            <div class="grid grid-3" style="margin-top: 0.5rem; align-items: end;">
              <div class="form-group">
                <label for="new-image-url">Image URL</label>
                <input id="new-image-url" class="input" bind:value={newImage.image_url} placeholder="https://..." />
              </div>
              <div class="form-group">
                <label for="new-image-sort">Sort Order</label>
                <input id="new-image-sort" class="input" type="number" bind:value={newImage.sort_order} min="0" />
              </div>
              <div class="form-group" style="display: flex; align-items: center; gap: 0.75rem; padding-top: 1.5rem;">
                <label style="display: flex; align-items: center; gap: 0.25rem;">
                  <input type="checkbox" bind:checked={newImage.is_primary} /> Primary
                </label>
                <button class="btn btn-sm btn-primary" type="button" on:click={addImage}>Add</button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-1">
          <button class="btn btn-primary" type="submit">Save</button>
          <button class="btn" type="button" on:click={() => editing = false}>Cancel</button>
        </div>
      </form>
    </div>
  {:else}
    <div class="card mb-2">
      <div class="grid grid-2">
        <div><strong>Description:</strong> {spu.description || '-'}</div>
        <div><strong>Category:</strong> {spu.category_name || spu.category_id || '-'}</div>
        <div><strong>Status:</strong> <span class="badge badge-{spu.status}">{spu.status}</span></div>
      </div>
    </div>
  {/if}

  <!-- Spec Attributes -->
  {#if spu.spec_attributes && spu.spec_attributes.length > 0}
    <div class="card mb-2">
      <h3 style="margin-bottom: 0.5rem;">Spec Attributes</h3>
      {#each spu.spec_attributes as spec}
        <span class="badge badge-published" style="margin-right: 0.5rem;">
          {spec.name}: {Array.isArray(spec.values) ? spec.values.join(', ') : spec.values}
        </span>
      {/each}
    </div>
  {/if}

  <!-- Tags -->
  {#if spu.tags && spu.tags.length > 0}
    <div class="card mb-2">
      <h3 style="margin-bottom: 0.5rem;">Tags</h3>
      {#each spu.tags as tag}
        <span class="badge badge-draft" style="margin-right: 0.5rem;">{typeof tag === 'string' ? tag : tag.name}</span>
      {/each}
    </div>
  {/if}

  <!-- Images -->
  {#if spu.images && spu.images.length > 0}
    <div class="card mb-2">
      <h3 style="margin-bottom: 0.5rem;">Images</h3>
      <div class="flex gap-1" style="flex-wrap: wrap;">
        {#each spu.images as img}
          <div style="border: 1px solid var(--border); border-radius: 8px; overflow: hidden; width: 120px;">
            <img src={img.image_url} alt={img.alt_text || ''} style="width: 100%; height: 80px; object-fit: cover;" />
            <div class="text-sm" style="padding: 0.25rem; text-align: center;">
              {img.is_primary ? 'Primary' : `#${img.sort_order || ''}`}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- SKUs -->
  <div class="card mb-2">
    <div class="flex-between mb-2">
      <h3>SKUs</h3>
      <button class="btn btn-sm btn-primary" on:click={() => showNewSku = !showNewSku}>
        {showNewSku ? 'Cancel' : '+ New SKU'}
      </button>
    </div>

    {#if showNewSku}
      <form on:submit|preventDefault={createSku} style="margin-bottom: 1rem;">
        <div class="grid grid-2">
          <div class="form-group">
            <label for="new-sku-code">SKU Code</label>
            <input id="new-sku-code" class="input" bind:value={skuForm.sku_code} required placeholder="e.g. PROD-001-SM" />
          </div>
          <div class="form-group">
            <label for="new-sku-spec">Spec Combination (JSON)</label>
            <input id="new-sku-spec" class="input" bind:value={skuForm.spec_combination} placeholder="strength:500mg, size:large" />
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Create SKU</button>
      </form>
    {/if}

    {#if spu.skus && spu.skus.length > 0}
      <table>
        <thead>
          <tr><th>SKU Code</th><th>Spec Combination</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {#each spu.skus as sku}
            <tr>
              <td style="font-family: monospace;">{sku.sku_code}</td>
              {#if editingSku === sku.id}
                <td>
                  <textarea class="input" bind:value={skuEditForm.spec_combination} rows="2" style="font-family: monospace; font-size: 0.8rem;"></textarea>
                </td>
                <td><span class="badge badge-{sku.status}">{sku.status}</span></td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn btn-sm btn-primary" on:click={() => saveSku(sku.id)}>Save</button>
                    <button class="btn btn-sm" on:click={cancelEditSku}>Cancel</button>
                  </div>
                </td>
              {:else}
                <td class="text-sm">{typeof sku.spec_combination === 'object' ? JSON.stringify(sku.spec_combination) : sku.spec_combination}</td>
                <td><span class="badge badge-{sku.status}">{sku.status}</span></td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn btn-sm" on:click={() => startEditSku(sku)}>Edit</button>
                    {#if sku.status === 'draft' || sku.status === 'unpublished'}
                      <button class="btn btn-sm btn-primary" on:click={() => changeSkuStatus(sku.id, 'published')}>Publish</button>
                    {/if}
                    {#if sku.status === 'published'}
                      <button class="btn btn-sm" on:click={() => changeSkuStatus(sku.id, 'unpublished')}>Unpublish</button>
                    {/if}
                    {#if sku.status !== 'archived'}
                      <button class="btn btn-sm btn-danger" on:click={() => changeSkuStatus(sku.id, 'archived')}>Archive</button>
                    {/if}
                  </div>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="text-sm text-muted">No SKUs yet</div>
    {/if}
  </div>
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} on:close={() => toast = null} />{/if}
