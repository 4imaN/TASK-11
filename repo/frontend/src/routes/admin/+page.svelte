<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';

  let stats = { products: 0, warehouses: 0 };
  let systemStatus = 'Unknown';
  let recentAudit = [];
  let error = null;

  onMount(async () => {
    try {
      const [spus, wh, health, audit] = await Promise.all([
        api.get('/spus?limit=1'),
        api.get('/warehouses'),
        api.get('/health').catch(() => ({ status: 'error' })),
        api.get('/audit-logs?limit=5'),
      ]);
      stats.products = spus.data?.total || spus.data?.items?.length || 0;
      stats.warehouses = Array.isArray(wh.data) ? wh.data.length : 0;
      systemStatus = health.status === 'ok' || health.data?.status === 'ok' ? 'Online' : 'Degraded';
      recentAudit = audit.data || [];
    } catch (err) {
      error = err.message || 'Failed to load dashboard data';
    }
  });
</script>

<h2 style="margin-bottom: 1.5rem;">Admin Dashboard</h2>

{#if error}
  <div class="card mb-2" style="background: #fecaca; border-color: var(--danger); color: #991b1b;">
    <strong>Error loading dashboard:</strong> {error}
  </div>
{/if}

<div class="grid grid-3">
  <div class="card text-center">
    <div class="text-muted text-sm">Products</div>
    <div style="font-size: 2rem; font-weight: 700;">{stats.products}</div>
  </div>
  <div class="card text-center">
    <div class="text-muted text-sm">System Status</div>
    <div style="font-size: 2rem; font-weight: 700; color: {systemStatus === 'Online' ? 'var(--success)' : 'var(--warning)'};">{systemStatus}</div>
  </div>
  <div class="card text-center">
    <div class="text-muted text-sm">Warehouses</div>
    <div style="font-size: 2rem; font-weight: 700;">{stats.warehouses}</div>
  </div>
</div>

<div class="card mt-2">
  <h3 style="margin-bottom: 1rem;">Recent Activity</h3>
  {#if recentAudit.length === 0}
    <p class="text-muted">No recent activity</p>
  {:else}
    <table>
      <thead><tr><th>Action</th><th>Entity</th><th>User</th><th>Time</th></tr></thead>
      <tbody>
        {#each recentAudit as log}
          <tr>
            <td>{log.action}</td>
            <td>{log.entity_type} {log.entity_id?.substring(0, 8)}</td>
            <td>{log.username || '-'}</td>
            <td class="text-sm text-muted">{new Date(log.created_at).toLocaleString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
