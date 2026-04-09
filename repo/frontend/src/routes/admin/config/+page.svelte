<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import Toast from '../../../components/Toast.svelte';

  let configs = [];
  let toast = null;
  let editingKey = null;
  let editValue = '';

  onMount(async () => {
    try {
      const data = await api.get('/config');
      configs = data.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  });

  function startEdit(config) {
    editingKey = config.key;
    editValue = JSON.stringify(config.value, null, 2);
  }

  async function save() {
    try {
      const value = JSON.parse(editValue);
      await api.put(`/config/${editingKey}`, { value });
      toast = { message: 'Config updated', type: 'success' };
      editingKey = null;
      const data = await api.get('/config');
      configs = data.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }
</script>

<h2 style="margin-bottom: 1.5rem;">System Configuration</h2>

{#each configs as config}
  <div class="card">
    <div class="flex-between">
      <div>
        <strong>{config.key}</strong>
        <p class="text-sm text-muted">{config.description || ''}</p>
      </div>
      <button class="btn btn-sm" on:click={() => startEdit(config)}>Edit</button>
    </div>
    {#if editingKey === config.key}
      <div class="mt-2">
        <textarea class="input" rows="6" bind:value={editValue} style="font-family: monospace; font-size: 0.8rem;"></textarea>
        <div class="flex gap-1 mt-1">
          <button class="btn btn-primary btn-sm" on:click={save}>Save</button>
          <button class="btn btn-sm" on:click={() => editingKey = null}>Cancel</button>
        </div>
      </div>
    {:else}
      <pre class="text-sm mt-1" style="background: #f8fafc; padding: 0.5rem; border-radius: 4px; overflow-x: auto;">{JSON.stringify(config.value, null, 2)}</pre>
    {/if}
  </div>
{/each}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
