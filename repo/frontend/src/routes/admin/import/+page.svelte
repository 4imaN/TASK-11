<script>
  import { api } from '$lib/api.js';
  import Toast from '../../../components/Toast.svelte';

  let importType = 'spu';
  let file = null;
  let validationResult = null;
  let importing = false;
  let committing = false;
  let toast = null;

  const types = ['spu', 'sku', 'inventory', 'supplier-pricing'];

  async function downloadTemplate() {
    try {
      const { blob, filename } = await api.download(`/import/templates/${importType}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }

  async function validate() {
    if (!file) return;
    importing = true;
    validationResult = null;
    try {
      const data = await api.upload(`/import/${importType}`, file);
      validationResult = data.data;
      toast = { message: `Validated: ${validationResult.valid_count} valid, ${validationResult.error_count} errors`, type: validationResult.error_count > 0 ? 'warning' : 'success' };
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    } finally { importing = false; }
  }

  async function commit() {
    if (!validationResult?.import_session_id) return;
    committing = true;
    try {
      const data = await api.post(`/import/${importType}/commit`, { import_session_id: validationResult.import_session_id });
      toast = { message: `Imported ${data.data.imported_count} rows, skipped ${data.data.skipped_count}`, type: 'success' };
      validationResult = null;
    } catch (err) {
      toast = { message: err.message, type: 'error' };
    } finally { committing = false; }
  }

  async function exportData() {
    try {
      const { blob, filename } = await api.download(`/export/${importType}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast = { message: err.message, type: 'error' }; }
  }
</script>

<h2 style="margin-bottom: 1.5rem;">Import / Export</h2>

<div class="card mb-2">
  <div class="form-group">
    <label for="import-data-type">Data Type</label>
    <select id="import-data-type" class="input" style="width: 250px;" bind:value={importType}>
      {#each types as t}<option value={t}>{t}</option>{/each}
    </select>
  </div>

  <div class="flex gap-2 mb-2">
    <button class="btn" on:click={downloadTemplate}>Download Template</button>
    <button class="btn" on:click={exportData}>Export Current Data</button>
  </div>

  <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border);" />

  <div class="form-group">
    <label for="import-file-upload">Upload Excel File</label>
    <input id="import-file-upload" type="file" accept=".xlsx,.xls" on:change={(e) => file = e.target.files[0]} />
  </div>

  <button class="btn btn-primary" on:click={validate} disabled={!file || importing}>
    {importing ? 'Validating...' : 'Validate Import'}
  </button>
</div>

{#if validationResult}
  <div class="card">
    <h3 style="margin-bottom: 1rem;">Validation Results</h3>
    <div class="grid grid-3 mb-2">
      <div class="text-center">
        <div class="text-sm text-muted">Total Rows</div>
        <div style="font-size: 1.5rem; font-weight: 700;">{validationResult.total}</div>
      </div>
      <div class="text-center">
        <div class="text-sm text-muted">Valid</div>
        <div style="font-size: 1.5rem; font-weight: 700; color: var(--success);">{validationResult.valid_count}</div>
      </div>
      <div class="text-center">
        <div class="text-sm text-muted">Errors</div>
        <div style="font-size: 1.5rem; font-weight: 700; color: var(--danger);">{validationResult.error_count}</div>
      </div>
    </div>

    {#if validationResult.error_rows?.length > 0}
      <h4 style="margin: 1rem 0 0.5rem;">Row Errors</h4>
      <table>
        <thead><tr><th>Row</th><th>Field</th><th>Error</th></tr></thead>
        <tbody>
          {#each validationResult.error_rows as err}
            {#each err.errors as e}
              <tr>
                <td>{err.row}</td>
                <td class="text-sm">{e.field}</td>
                <td class="text-sm" style="color: var(--danger);">{e.message}</td>
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
    {/if}

    {#if validationResult.valid_count > 0}
      <button class="btn btn-primary mt-2" on:click={commit} disabled={committing}>
        {committing ? 'Committing...' : `Commit ${validationResult.valid_count} Valid Rows`}
      </button>
    {/if}
  </div>
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
