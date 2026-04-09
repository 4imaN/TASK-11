<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import Toast from '../../../components/Toast.svelte';

  let tokens = [];
  let deadLetters = [];
  let toast = null;
  let newTokenName = '';
  let createdToken = null;

  onMount(async () => {
    try {
      const [t, d] = await Promise.all([
        api.get('/integration/tokens'),
        api.get('/integration/dead-letter'),
      ]);
      tokens = t.data || [];
      deadLetters = d.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  });

  async function createToken() {
    try {
      const data = await api.post('/integration/tokens', { name: newTokenName });
      createdToken = data.data;
      toast = { message: 'Token created - save credentials now!', type: 'warning' };
      newTokenName = '';
      const t = await api.get('/integration/tokens');
      tokens = t.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  async function retryJob(id) {
    try {
      await api.post(`/integration/dead-letter/${id}/retry`);
      toast = { message: 'Job queued for retry', type: 'success' };
      const d = await api.get('/integration/dead-letter');
      deadLetters = d.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }
</script>

<h2 style="margin-bottom: 1.5rem;">Integration API</h2>

<div class="card mb-2">
  <h3>API Tokens</h3>
  <div class="flex gap-2 mt-2 mb-2">
    <input class="input" style="width: 300px;" placeholder="Token name" bind:value={newTokenName} />
    <button class="btn btn-primary" on:click={createToken} disabled={!newTokenName}>Create Token</button>
  </div>

  {#if createdToken}
    <div style="background: #fef3c7; padding: 1rem; border-radius: var(--radius); margin-bottom: 1rem;">
      <strong>Save these credentials now — they won't be shown again:</strong><br/>
      <code>Token: {createdToken.token}</code><br/>
      <code>Secret Key: {createdToken.secret_key}</code>
    </div>
  {/if}

  <table>
    <thead><tr><th>Name</th><th>Rate Limit</th><th>Status</th><th>Created</th></tr></thead>
    <tbody>
      {#each tokens as t}
        <tr>
          <td>{t.name}</td>
          <td>{t.rate_limit}/min</td>
          <td><span class="badge badge-{t.status === 'active' ? 'published' : 'failed'}">{t.status}</span></td>
          <td class="text-sm">{new Date(t.created_at).toLocaleDateString()}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="card">
  <h3>Dead Letter Queue</h3>
  {#if deadLetters.length === 0}
    <p class="text-muted mt-1">No dead-letter entries</p>
  {:else}
    <table>
      <thead><tr><th>ID</th><th>Attempts</th><th>Error</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        {#each deadLetters as job}
          <tr>
            <td class="text-sm" style="font-family: monospace;">{job.id.substring(0, 8)}</td>
            <td>{job.attempts}</td>
            <td class="text-sm" style="color: var(--danger);">{job.last_error}</td>
            <td class="text-sm">{new Date(job.updated_at).toLocaleString()}</td>
            <td><button class="btn btn-sm" on:click={() => retryJob(job.id)}>Retry</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
