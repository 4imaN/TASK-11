<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import Toast from '../../../components/Toast.svelte';

  let projectsList = [];
  let departments = [];
  let toast = null;
  let showCreate = false;
  let submitting = false;
  let form = { name: '', description: '', department_id: '' };

  onMount(async () => {
    try {
      const [p, d] = await Promise.all([api.get('/projects'), api.get('/departments')]);
      projectsList = p.data || [];
      departments = d.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  });

  async function create() {
    submitting = true;
    try {
      await api.post('/projects', form);
      toast = { message: 'Project created', type: 'success' };
      showCreate = false;
      const p = await api.get('/projects');
      projectsList = p.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    finally { submitting = false; }
  }
</script>

<div class="flex-between mb-2">
  <h2>Projects</h2>
  <button class="btn btn-primary" on:click={() => showCreate = !showCreate}>
    {showCreate ? 'Cancel' : '+ New Project'}
  </button>
</div>

{#if showCreate}
  <div class="card mb-2">
    <form on:submit|preventDefault={create}>
      <div class="grid grid-2">
        <div class="form-group"><label for="project-name">Name</label><input id="project-name" class="input" bind:value={form.name} required /></div>
        <div class="form-group">
          <label for="project-department">Department</label>
          <select id="project-department" class="input" bind:value={form.department_id}>
            <option value="">Select</option>
            {#each departments as d}<option value={d.id}>{d.name}</option>{/each}
          </select>
        </div>
      </div>
      <div class="form-group"><label for="project-description">Description</label><textarea id="project-description" class="input" bind:value={form.description} rows="2"></textarea></div>
      <button class="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</button>
    </form>
  </div>
{/if}

<table>
  <thead><tr><th>Name</th><th>Description</th><th>Status</th></tr></thead>
  <tbody>
    {#each projectsList as p}
      <tr>
        <td>{p.name}</td>
        <td class="text-sm text-muted">{p.description || '-'}</td>
        <td><span class="badge badge-{p.status}">{p.status}</span></td>
      </tr>
    {/each}
  </tbody>
</table>

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
