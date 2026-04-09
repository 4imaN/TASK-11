<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import Toast from '../../components/Toast.svelte';
  import { user } from '../../stores/auth.js';

  let tasks = [];
  let loading = true;
  let toast = null;
  let mode = 'grab';
  let metrics = null;
  let acceptingId = null;   // task currently being accepted (shows spinner)
  let removedIds = new Set(); // tasks sliding out after accept

  onMount(loadData);

  async function loadData() {
    loading = true;
    try {
      const [t, m] = await Promise.all([
        api.get(`/tasks?mode=${mode}&limit=50`),
        api.get('/worker-metrics'),
      ]);
      tasks = t.data || [];
      metrics = m.data;
      removedIds = new Set();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    loading = false;
  }

  async function acceptTask(task) {
    acceptingId = task.id;
    try {
      await api.post(`/tasks/${task.id}/accept`, { version: task.version });
      // Mark as removed so it slides out
      removedIds = new Set([...removedIds, task.id]);
      toast = { message: `Task ${task.id.substring(0, 8)} accepted — check "Assigned to Me"`, type: 'success' };
      // Wait for animation, then refresh
      setTimeout(async () => {
        await loadData();
        acceptingId = null;
      }, 400);
    } catch (err) {
      acceptingId = null;
      if (err.code === 'CONFLICT') {
        toast = { message: 'Task already taken or modified — refreshing list', type: 'warning' };
      } else {
        toast = { message: err.message, type: 'error' };
      }
      await loadData();
    }
  }

  async function updateStatus(taskId, status) {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status });
      toast = { message: `Task ${status}`, type: 'success' };
      await loadData();
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  function statusColor(status) {
    const map = { open: 'open', assigned: 'draft', accepted: 'accepted', in_progress: 'warning', completed: 'completed', failed: 'failed', cancelled: 'draft' };
    return map[status] || 'draft';
  }
</script>

<div class="flex-between mb-2">
  <h2>Task Board</h2>
  <div class="flex gap-2">
    <button class="btn" class:btn-primary={mode === 'grab'} on:click={() => { mode = 'grab'; loadData(); }}>Grab Order</button>
    <button class="btn" class:btn-primary={mode === 'assigned'} on:click={() => { mode = 'assigned'; loadData(); }}>Assigned to Me</button>
  </div>
</div>

{#if metrics}
  <div class="grid grid-3 mb-2">
    <div class="card text-center">
      <div class="text-sm text-muted">Completed</div>
      <div style="font-size: 1.5rem; font-weight: 700;">{metrics.completed_count}</div>
    </div>
    <div class="card text-center">
      <div class="text-sm text-muted">Active</div>
      <div style="font-size: 1.5rem; font-weight: 700;">{metrics.active_task_count}</div>
    </div>
    <div class="card text-center">
      <div class="text-sm text-muted">Reputation</div>
      <div style="font-size: 1.5rem; font-weight: 700;">{metrics.reputation_score}</div>
      <div class="score-bar mt-1"><div class="score-bar-fill" style="width: {metrics.reputation_score}%"></div></div>
    </div>
  </div>
{/if}

{#if loading}
  <div class="loading">Loading tasks...</div>
{:else if tasks.length === 0}
  <div class="empty-state">No tasks available in {mode} mode</div>
{:else}
  {#each tasks as task (task.id)}
    <div class="task-card" class:task-card-removing={removedIds.has(task.id)} class:task-card-accepted={removedIds.has(task.id)}>
      {#if removedIds.has(task.id)}
        <div class="accepted-banner">Accepted</div>
      {/if}
      <div class="flex-between">
        <div>
          <span class="badge badge-{statusColor(task.status)}">{task.status}</span>
          <span class="text-sm text-muted" style="margin-left: 0.5rem;">Task {task.id.substring(0, 8)}</span>
        </div>
        {#if task.due_window_end}
          <span class="text-sm text-muted">Due: {new Date(task.due_window_end).toLocaleString()}</span>
        {/if}
      </div>

      <div class="mt-1">
        <span class="text-sm">Warehouse: {task.warehouse_name || '-'}</span>
        {#if task.assigned_user_name}
          <span class="text-sm" style="margin-left: 1rem;">Assigned: {task.assigned_user_name}</span>
        {/if}
        {#if task.recommendation}
          <span class="text-sm" style="margin-left: 1rem;">Score: {task.recommendation.total}</span>
        {/if}
      </div>

      <div class="flex gap-1 mt-2">
        {#if task.status === 'open' && !removedIds.has(task.id)}
          <button
            class="btn btn-primary btn-sm"
            on:click={() => acceptTask(task)}
            disabled={acceptingId === task.id}
          >
            {#if acceptingId === task.id}
              Accepting...
            {:else}
              Accept
            {/if}
          </button>
        {/if}
        {#if task.status === 'assigned' && !removedIds.has(task.id)}
          <button
            class="btn btn-primary btn-sm"
            on:click={() => acceptTask(task)}
            disabled={acceptingId === task.id}
          >
            {#if acceptingId === task.id}
              Accepting...
            {:else}
              Accept
            {/if}
          </button>
        {/if}
        {#if task.status === 'accepted'}
          <button class="btn btn-sm btn-primary" on:click={() => updateStatus(task.id, 'in_progress')}>Start</button>
        {/if}
        {#if task.status === 'in_progress'}
          <button class="btn btn-sm" style="background: var(--success); color: white;" on:click={() => updateStatus(task.id, 'completed')}>Complete</button>
          <button class="btn btn-sm btn-danger" on:click={() => updateStatus(task.id, 'failed')}>Failed</button>
        {/if}
        {#if ['accepted', 'in_progress'].includes(task.status)}
          <button class="btn btn-sm" on:click={() => updateStatus(task.id, 'cancelled')}>Cancel</button>
        {:else if ['open', 'assigned'].includes(task.status) && $user?.roles?.includes('admin')}
          <button class="btn btn-sm" on:click={() => updateStatus(task.id, 'cancelled')}>Cancel</button>
        {/if}
      </div>
    </div>
  {/each}
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}

<style>
  .task-card-removing {
    animation: slideOut 0.4s ease-out forwards;
    pointer-events: none;
  }
  .task-card-accepted {
    border-left: 4px solid var(--success, #22c55e);
    background: rgba(34, 197, 94, 0.06);
  }
  .accepted-banner {
    background: var(--success, #22c55e);
    color: white;
    text-align: center;
    font-weight: 600;
    font-size: 0.85rem;
    padding: 0.25rem 0;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    animation: fadeIn 0.15s ease-in;
  }
  @keyframes slideOut {
    0%   { opacity: 1; max-height: 200px; transform: translateX(0); }
    60%  { opacity: 0.3; transform: translateX(30px); }
    100% { opacity: 0; max-height: 0; padding: 0; margin: 0; overflow: hidden; transform: translateX(60px); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to   { opacity: 1; transform: scale(1); }
  }
</style>
