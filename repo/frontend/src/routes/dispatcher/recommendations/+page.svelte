<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import Toast from '../../../components/Toast.svelte';

  let recommendations = [];
  let loading = true;
  let toast = null;

  onMount(async () => {
    try {
      const data = await api.get('/tasks/recommendations');
      recommendations = data.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    loading = false;
  });

  async function acceptTask(task) {
    try {
      await api.post(`/tasks/${task.id}/accept`, { version: task.version });
      toast = { message: 'Task accepted!', type: 'success' };
      const data = await api.get('/tasks/recommendations');
      recommendations = data.data || [];
    } catch (err) {
      if (err.code === 'CONFLICT') {
        toast = { message: 'Task already taken', type: 'warning' };
      } else {
        toast = { message: err.message, type: 'error' };
      }
    }
  }
</script>

<h2 style="margin-bottom: 1.5rem;">Recommended Tasks</h2>

{#if loading}
  <div class="loading">Loading recommendations...</div>
{:else if recommendations.length === 0}
  <div class="empty-state">No tasks recommended at this time</div>
{:else}
  {#each recommendations as task, i}
    <div class="task-card">
      <div class="flex-between">
        <div>
          <strong>#{i + 1}</strong>
          <span class="badge badge-open" style="margin-left: 0.5rem;">Score: {task.recommendation.total}</span>
        </div>
        {#if task.due_window_end}
          <span class="text-sm text-muted">Due: {new Date(task.due_window_end).toLocaleString()}</span>
        {/if}
      </div>

      <div class="grid grid-3 mt-1">
        <div class="text-sm">
          <span class="text-muted">Time fit:</span> {task.recommendation.breakdown.time_window}
        </div>
        <div class="text-sm">
          <span class="text-muted">Workload:</span> {task.recommendation.breakdown.workload}
        </div>
        <div class="text-sm">
          <span class="text-muted">Reputation:</span> {task.recommendation.breakdown.reputation}
        </div>
      </div>

      <div class="score-bar mt-1">
        <div class="score-bar-fill" style="width: {task.recommendation.total}%"></div>
      </div>

      <div class="mt-2">
        <span class="text-sm">Warehouse: {task.warehouse_name || '-'}</span>
        <button class="btn btn-primary btn-sm" style="margin-left: 1rem;" on:click={() => acceptTask(task)}>Accept Task</button>
      </div>
    </div>
  {/each}
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
