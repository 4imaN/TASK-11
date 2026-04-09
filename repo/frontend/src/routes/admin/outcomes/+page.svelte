<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import Toast from '../../../components/Toast.svelte';

  let outcomes = [];
  let projects = [];
  let loading = true;
  let toast = null;
  let showCreate = false;
  let submitting = false;
  let form = { type: 'study', title: '', certificate_number: '', description: '', projects: [] };
  let warnings = [];
  let newProjId = '';
  let newProjShare = 0;

  onMount(async () => {
    try {
      const [o, p] = await Promise.all([api.get('/outcomes'), api.get('/projects')]);
      outcomes = o.data || [];
      projects = p.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    loading = false;
  });

  async function create() {
    submitting = true;
    try {
      const data = await api.post('/outcomes', form);
      warnings = data.data.duplicate_warnings || [];
      if (warnings.length > 0) {
        toast = { message: `Created with ${warnings.length} duplicate warning(s)`, type: 'warning' };
      } else {
        toast = { message: 'Outcome created', type: 'success' };
      }
      showCreate = false;
      const o = await api.get('/outcomes');
      outcomes = o.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    finally { submitting = false; }
  }

  function addProject() {
    if (newProjId && newProjShare > 0) {
      form.projects = [...form.projects, { project_id: newProjId, contribution_share: newProjShare }];
      newProjId = '';
      newProjShare = 0;
    }
  }

  async function changeStatus(id, status) {
    try {
      await api.patch(`/outcomes/${id}/status`, { status });
      toast = { message: `Status changed to ${status}`, type: 'success' };
      const o = await api.get('/outcomes');
      outcomes = o.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  let uploadingFor = null;
  let evidenceFile = null;

  // Detail view state
  let expandedOutcomeId = null;
  let outcomeDetail = null;
  let detailLoading = false;

  async function uploadEvidence(outcomeId) {
    if (!evidenceFile) return;
    try {
      await api.upload(`/outcomes/${outcomeId}/evidence`, evidenceFile);
      toast = { message: 'Evidence uploaded', type: 'success' };
      uploadingFor = null;
      evidenceFile = null;
      // Refresh detail if viewing this outcome
      if (expandedOutcomeId === outcomeId) {
        await viewOutcome(outcomeId);
      }
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  async function viewOutcome(id) {
    if (expandedOutcomeId === id) {
      expandedOutcomeId = null;
      outcomeDetail = null;
      return;
    }
    expandedOutcomeId = id;
    detailLoading = true;
    try {
      const res = await api.get(`/outcomes/${id}`);
      outcomeDetail = res.data;
    } catch (err) {
      toast = { message: err.message, type: 'error' };
      outcomeDetail = null;
    } finally {
      detailLoading = false;
    }
  }

  async function downloadEvidence(evidenceId, filename) {
    try {
      const { blob, filename: fname } = await api.download(`/evidence/${evidenceId}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname || filename || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    }
  }
</script>

<div class="flex-between mb-2">
  <h2>Outcomes</h2>
  <button class="btn btn-primary" on:click={() => showCreate = !showCreate}>
    {showCreate ? 'Cancel' : '+ New Outcome'}
  </button>
</div>

{#if warnings.length > 0}
  <div class="card mb-2" style="background: #fef3c7;">
    <strong>Duplicate Warnings:</strong>
    <ul style="margin: 0.5rem 0 0 1.5rem; font-size: 0.875rem;">
      {#each warnings as w}
        <li>{w.field}: {w.match_type} match with "{w.existing_title}"</li>
      {/each}
    </ul>
  </div>
{/if}

{#if showCreate}
  <div class="card mb-2">
    <form on:submit|preventDefault={create}>
      <div class="grid grid-2">
        <div class="form-group">
          <label for="outcome-type">Type</label>
          <select id="outcome-type" class="input" bind:value={form.type}>
            <option value="study">Study</option>
            <option value="patent">Patent</option>
            <option value="award">Award</option>
            <option value="copyright">Copyright</option>
          </select>
        </div>
        <div class="form-group"><label for="outcome-title">Title</label><input id="outcome-title" class="input" bind:value={form.title} required /></div>
      </div>
      <div class="form-group"><label for="outcome-cert-number">Certificate Number</label><input id="outcome-cert-number" class="input" bind:value={form.certificate_number} /></div>
      <div class="form-group"><label for="outcome-description">Description</label><textarea id="outcome-description" class="input" bind:value={form.description} rows="3"></textarea></div>

      <div class="form-group">
        <label for="outcome-project-select">Project Contributions (must sum to 100%)</label>
        <div class="flex gap-1 mb-2">
          <select id="outcome-project-select" class="input" style="width: 250px;" bind:value={newProjId}>
            <option value="">Select project</option>
            {#each projects as p}<option value={p.id}>{p.name}</option>{/each}
          </select>
          <input class="input" type="number" style="width: 100px;" placeholder="%" bind:value={newProjShare} min="0.01" max="100" step="0.01" aria-label="Contribution share percentage" />
          <button class="btn" type="button" on:click={addProject}>Add</button>
        </div>
        {#each form.projects as proj}
          <span class="badge badge-published">
            {projects.find(p => p.id === proj.project_id)?.name || proj.project_id}: {proj.contribution_share}%
          </span>
        {/each}
        {#if form.projects.length > 0}
          {@const totalShare = form.projects.reduce((s, p) => s + p.contribution_share, 0)}
          <div class="text-sm mt-1" style="color: {Math.abs(totalShare - 100) < 0.001 ? 'green' : '#b91c1c'};">
            Total: {totalShare}%
            {#if Math.abs(totalShare - 100) >= 0.001}
              -- must sum to 100%
            {/if}
          </div>
        {/if}
      </div>

      {#if form.projects.length > 0 && Math.abs(form.projects.reduce((s, p) => s + p.contribution_share, 0) - 100) >= 0.001}
        <div class="card mb-2" style="background: #fef3c7; padding: 0.5rem 1rem; font-size: 0.875rem; color: #92400e;">
          Project contribution shares must sum to exactly 100% before creating an outcome.
        </div>
      {/if}

      <button
        class="btn btn-primary"
        type="submit"
        disabled={submitting || (form.projects.length > 0 && Math.abs(form.projects.reduce((s, p) => s + p.contribution_share, 0) - 100) >= 0.001)}
      >{submitting ? 'Creating...' : 'Create Outcome'}</button>
    </form>
  </div>
{/if}

{#if loading}
  <div class="loading">Loading...</div>
{:else}
  <table>
    <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>
      {#each outcomes as o}
        <tr>
          <td>{o.title}</td>
          <td><span class="badge badge-draft">{o.type}</span></td>
          <td><span class="badge badge-{o.status}">{o.status}</span></td>
          <td>
            <div class="flex gap-1">
              <button class="btn btn-sm" on:click={() => viewOutcome(o.id)}>
                {expandedOutcomeId === o.id ? 'Hide' : 'View'}
              </button>
              {#if o.status === 'draft'}
                <button class="btn btn-sm btn-primary" on:click={() => changeStatus(o.id, 'submitted')}>Submit</button>
              {/if}
              {#if o.status === 'submitted'}
                <button class="btn btn-sm btn-primary" on:click={() => changeStatus(o.id, 'published')}>Publish</button>
              {/if}
              {#if uploadingFor === o.id}
                <input type="file" on:change={(e) => evidenceFile = e.target.files[0]} style="width: 150px;" />
                <button class="btn btn-sm" on:click={() => uploadEvidence(o.id)}>Upload</button>
              {:else}
                <button class="btn btn-sm" on:click={() => uploadingFor = o.id}>Add Evidence</button>
              {/if}
            </div>
          </td>
        </tr>
        {#if expandedOutcomeId === o.id}
          <tr>
            <td colspan="4">
              <div class="card" style="margin: 0.5rem 0;">
                {#if detailLoading}
                  <div class="loading">Loading details...</div>
                {:else if outcomeDetail}
                  <div class="grid grid-2" style="margin-bottom: 1rem;">
                    <div><strong>Title:</strong> {outcomeDetail.title}</div>
                    <div><strong>Type:</strong> <span class="badge badge-draft">{outcomeDetail.type}</span></div>
                    <div><strong>Status:</strong> <span class="badge badge-{outcomeDetail.status}">{outcomeDetail.status}</span></div>
                    <div><strong>Certificate Number:</strong> {outcomeDetail.certificate_number_display || '-'}</div>
                  </div>
                  {#if outcomeDetail.description}
                    <div style="margin-bottom: 1rem;"><strong>Description:</strong> {outcomeDetail.description}</div>
                  {/if}

                  {#if outcomeDetail.projects && outcomeDetail.projects.length > 0}
                    <div style="margin-bottom: 1rem;">
                      <strong>Project Contributions:</strong>
                      <table style="margin-top: 0.5rem;">
                        <thead><tr><th>Project</th><th>Share</th></tr></thead>
                        <tbody>
                          {#each outcomeDetail.projects as proj}
                            <tr>
                              <td>{proj.project_name || proj.project_id}</td>
                              <td>{proj.contribution_share}%</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {/if}

                  {#if outcomeDetail.evidence && outcomeDetail.evidence.length > 0}
                    <div>
                      <strong>Evidence Files:</strong>
                      <table style="margin-top: 0.5rem;">
                        <thead><tr><th>Filename</th><th>Type</th><th>Actions</th></tr></thead>
                        <tbody>
                          {#each outcomeDetail.evidence as ev}
                            <tr>
                              <td class="text-sm">{ev.file_name || 'File'}</td>
                              <td class="text-sm">{ev.mime_type || '-'}</td>
                              <td>
                                <button class="btn btn-sm" on:click={() => downloadEvidence(ev.id, ev.file_name)}>Download</button>
                              </td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {:else}
                    <div class="text-sm text-muted">No evidence files</div>
                  {/if}
                {:else}
                  <div class="text-sm text-muted">Could not load details</div>
                {/if}
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
