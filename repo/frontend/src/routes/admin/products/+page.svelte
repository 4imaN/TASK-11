<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import ThresholdBadge from '../../../components/ThresholdBadge.svelte';
  import Toast from '../../../components/Toast.svelte';

  let spus = [];
  let categories = [];
  let tags = [];
  let search = '';
  let statusFilter = '';
  let categoryFilter = '';
  let loading = true;
  let toast = null;

  let showCreate = false;
  let form = { name: '', description: '', category_id: '', tags: [], spec_attributes: [], images: [] };
  let newSpecName = '';
  let newSpecValues = '';

  let newImage = { image_url: '', is_primary: false, sort_order: 0 };

  function addImage() {
    if (!newImage.image_url) return;
    form.images = [...form.images, { ...newImage }];
    newImage = { image_url: '', is_primary: false, sort_order: form.images.length };
  }

  function removeImage(index) {
    form.images = form.images.filter((_, i) => i !== index);
  }

  onMount(loadData);

  async function loadData() {
    loading = true;
    try {
      const { cachedGet } = await import('$lib/offlineApi.js');
      const [spuData, catData, tagData] = await Promise.all([
        cachedGet(`/spus?search=${search}&status=${statusFilter}&category_id=${categoryFilter}&limit=50`, `admin_spus_${search}_${statusFilter}_${categoryFilter}`),
        cachedGet('/categories?flat=true', 'categories_flat', 10 * 60 * 1000),
        cachedGet('/tags', 'tags', 10 * 60 * 1000),
      ]);
      spus = spuData.data.items || [];
      categories = catData.data || [];
      tags = tagData.data || [];
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    } finally {
      loading = false;
    }
  }

  async function createSPU() {
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('post', '/spus', form);
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: 'Product created', type: 'success' };
      }
      showCreate = false;
      form = { name: '', description: '', category_id: '', tags: [], spec_attributes: [], images: [] };
      await loadData();
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    }
  }

  async function toggleStatus(spu, newStatus) {
    try {
      const { mutationWithFallback } = await import('$lib/offlineApi.js');
      const result = await mutationWithFallback('patch', `/spus/${spu.id}/status`, { status: newStatus });
      if (result?.queued) {
        toast = { message: 'Saved offline — will sync when connected', type: 'warning' };
      } else {
        toast = { message: `Product ${newStatus}`, type: 'success' };
      }
      await loadData();
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    }
  }

  function addSpec() {
    if (newSpecName && newSpecValues) {
      form.spec_attributes = [...form.spec_attributes, {
        name: newSpecName,
        values: newSpecValues.split(',').map(v => v.trim()),
      }];
      newSpecName = '';
      newSpecValues = '';
    }
  }
</script>

<div class="flex-between mb-2">
  <h2>Products (SPU/SKU)</h2>
  <button class="btn btn-primary" on:click={() => showCreate = !showCreate}>
    {showCreate ? 'Cancel' : '+ New Product'}
  </button>
</div>

{#if showCreate}
  <div class="card mb-2">
    <h3 style="margin-bottom: 1rem;">Create New SPU</h3>
    <form on:submit|preventDefault={createSPU}>
      <div class="grid grid-2">
        <div class="form-group">
          <label for="product-name">Name</label>
          <input id="product-name" class="input" bind:value={form.name} required />
        </div>
        <div class="form-group">
          <label for="product-category">Category</label>
          <select id="product-category" class="input" bind:value={form.category_id}>
            <option value="">Select category</option>
            {#each categories as cat}
              <option value={cat.id}>{cat.name}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="product-description">Description</label>
        <textarea id="product-description" class="input" bind:value={form.description} rows="3"></textarea>
      </div>
      <div class="form-group">
        <label>Tags</label>
        <div class="flex gap-1" style="flex-wrap: wrap;">
          {#each tags as tag}
            <label style="font-size: 0.85rem;">
              <input type="checkbox" value={tag.id}
                on:change={(e) => {
                  if (e.target.checked) form.tags = [...form.tags, tag.id];
                  else form.tags = form.tags.filter(t => t !== tag.id);
                }} />
              {tag.name}
            </label>
          {/each}
        </div>
      </div>
      <div class="form-group">
        <label for="spec-attr-name">Spec Attributes</label>
        <div class="flex gap-1 mb-2">
          <input id="spec-attr-name" class="input" placeholder="Name (e.g. strength)" bind:value={newSpecName} style="width: 200px;" />
          <input id="spec-attr-values" class="input" placeholder="Values (comma-separated)" bind:value={newSpecValues} style="flex:1;" />
          <button class="btn" type="button" on:click={addSpec}>Add</button>
        </div>
        {#each form.spec_attributes as spec, i}
          <span class="badge badge-published">{spec.name}: {spec.values.join(', ')}</span>
        {/each}
      </div>
      <div class="form-group">
        <label>Images</label>
        <div style="border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; background: var(--bg-secondary, #f9f9f9);">
          <div class="grid grid-3" style="align-items: end;">
            <div class="form-group">
              <label for="create-image-url">Image URL</label>
              <input id="create-image-url" class="input" bind:value={newImage.image_url} placeholder="https://..." />
            </div>
            <div class="form-group">
              <label for="create-image-sort">Sort Order</label>
              <input id="create-image-sort" class="input" type="number" bind:value={newImage.sort_order} min="0" />
            </div>
            <div class="form-group" style="display: flex; align-items: center; gap: 0.75rem; padding-top: 1.5rem;">
              <label style="display: flex; align-items: center; gap: 0.25rem;">
                <input type="checkbox" bind:checked={newImage.is_primary} /> Primary
              </label>
              <button class="btn btn-sm btn-primary" type="button" on:click={addImage}>Add Image</button>
            </div>
          </div>
          {#if form.images.length > 0}
            <div class="flex gap-1 mt-1" style="flex-wrap: wrap;">
              {#each form.images as img, i}
                <span class="badge badge-published" style="margin-right: 0.25rem;">
                  {img.image_url} {img.is_primary ? '(Primary)' : `(Sort: ${img.sort_order})`}
                  <button type="button" style="background:none;border:none;cursor:pointer;color:inherit;font-weight:bold;margin-left:0.25rem;" on:click={() => removeImage(i)}>x</button>
                </span>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <button class="btn btn-primary" type="submit">Create Product</button>
    </form>
  </div>
{/if}

<div class="card mb-2">
  <div class="flex gap-2" style="flex-wrap: wrap;">
    <input class="input" style="width: 250px;" placeholder="Search products..." bind:value={search} on:input={loadData} />
    <select class="input" style="width: 150px;" bind:value={statusFilter} on:change={loadData}>
      <option value="">All statuses</option>
      <option value="draft">Draft</option>
      <option value="published">Published</option>
      <option value="unpublished">Unpublished</option>
      <option value="archived">Archived</option>
    </select>
    <select class="input" style="width: 200px;" bind:value={categoryFilter} on:change={loadData}>
      <option value="">All categories</option>
      {#each categories as cat}
        <option value={cat.id}>{cat.name}</option>
      {/each}
    </select>
  </div>
</div>

{#if loading}
  <div class="loading">Loading products...</div>
{:else if spus.length === 0}
  <div class="empty-state">No products found</div>
{:else}
  <table>
    <thead>
      <tr><th>Name</th><th>Category</th><th>Tags</th><th>Status</th><th>Actions</th></tr>
    </thead>
    <tbody>
      {#each spus as spu}
        <tr>
          <td>
            <a href="/admin/products/{spu.id}" style="color: var(--primary); text-decoration: none; font-weight: 500;">
              {spu.name}
            </a>
            {#if spu.primary_image}
              <img src={spu.primary_image} alt="" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px; vertical-align: middle; margin-left: 0.5rem;" />
            {/if}
          </td>
          <td class="text-sm">{spu.category_name || '-'}</td>
          <td>
            {#if spu.tags}
              {#each (Array.isArray(spu.tags) ? spu.tags : []) as tag}
                <span class="badge badge-draft">{tag}</span>
              {/each}
            {/if}
          </td>
          <td><span class="badge badge-{spu.status}">{spu.status}</span></td>
          <td>
            <div class="flex gap-1">
              {#if spu.status === 'draft' || spu.status === 'unpublished'}
                <button class="btn btn-sm btn-primary" on:click={() => toggleStatus(spu, 'published')}>Publish</button>
              {/if}
              {#if spu.status === 'published'}
                <button class="btn btn-sm" on:click={() => toggleStatus(spu, 'unpublished')}>Unpublish</button>
              {/if}
              {#if spu.status !== 'archived'}
                <button class="btn btn-sm btn-danger" on:click={() => toggleStatus(spu, 'archived')}>Archive</button>
              {/if}
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if toast}
  <Toast message={toast.message} type={toast.type} on:close={() => toast = null} />
{/if}
