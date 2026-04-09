<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';

  let logs = [];
  let loading = true;
  let error = null;
  let actionFilter = '';
  let entityFilter = '';

  onMount(loadLogs);

  async function loadLogs() {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entity_type', entityFilter);
      params.set('limit', '50');
      const data = await api.get(`/audit-logs?${params}`);
      logs = data.data || [];
    } catch (err) {
      error = err.message || 'Failed to load audit logs';
    }
    loading = false;
  }
</script>

<h2 style="margin-bottom: 1.5rem;">Audit Logs</h2>

{#if error}
  <div class="card mb-2" style="background: #fecaca; border-color: var(--danger); color: #991b1b;">
    <strong>Error:</strong> {error}
  </div>
{/if}

<div class="card mb-2">
  <div class="flex gap-2">
    <input class="input" style="width: 200px;" placeholder="Filter action..." bind:value={actionFilter} on:input={loadLogs} />
    <input class="input" style="width: 200px;" placeholder="Filter entity type..." bind:value={entityFilter} on:input={loadLogs} />
  </div>
</div>

{#if loading}
  <div class="loading">Loading...</div>
{:else}
  <table>
    <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
    <tbody>
      {#each logs as log}
        <tr>
          <td class="text-sm">{new Date(log.created_at).toLocaleString()}</td>
          <td class="text-sm">{log.username || '-'}</td>
          <td><span class="badge badge-draft">{log.action}</span></td>
          <td class="text-sm">{log.entity_type || '-'}</td>
          <td class="text-sm text-muted" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">
            {JSON.stringify(log.details || {})}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
