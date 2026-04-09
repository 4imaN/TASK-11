<script>
  import { api } from '$lib/api.js';
  import { onMount } from 'svelte';
  import Toast from '../../../components/Toast.svelte';

  let users = [];
  let roles = [];
  let warehouses = [];
  let departments = [];
  let stores = [];
  let loading = true;
  let toast = null;
  let showCreate = false;
  let form = { username: '', password: '', display_name: '', email: '', roles: [], scopes: [] };

  let submitting = false;
  let editingUserId = null;
  let editForm = { display_name: '', email: '', status: '', roles: [], scopes: [] };
  let newScopeType = 'warehouse';
  let newScopeId = '';
  let createScopeType = 'warehouse';
  let createScopeId = '';

  onMount(async () => {
    try {
      const [u, r, wh, dep, st] = await Promise.all([
        api.get('/users'),
        api.get('/roles'),
        api.get('/warehouses').catch(() => ({ data: [] })),
        api.get('/departments').catch(() => ({ data: [] })),
        api.get('/stores').catch(() => ({ data: [] })),
      ]);
      users = u.data || [];
      roles = r.data || [];
      warehouses = wh.data || [];
      departments = dep.data || [];
      stores = st.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    loading = false;
  });

  async function create() {
    submitting = true;
    try {
      await api.post('/users', form);
      toast = { message: 'User created', type: 'success' };
      showCreate = false;
      const u = await api.get('/users');
      users = u.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    finally { submitting = false; }
  }

  function startEdit(user) {
    editingUserId = user.id;
    const rawScopes = user.scopes || [];
    // Map backend scope format (scope_type/scope_id) to edit form format (type/ref_id)
    const mappedScopes = rawScopes.map(s => ({
      type: s.type || s.scope_type || 'warehouse',
      ref_id: s.ref_id || s.scope_id || '',
    }));
    editForm = {
      display_name: user.display_name || '',
      email: user.email || '',
      status: user.status || 'active',
      roles: [...(user.roles || [])],
      scopes: mappedScopes,
    };
  }

  function cancelEdit() {
    editingUserId = null;
  }

  function addScope() {
    if (!newScopeId) return;
    editForm.scopes = [...editForm.scopes, { type: newScopeType, ref_id: newScopeId }];
    newScopeId = '';
  }

  function removeScope(index) {
    editForm.scopes = editForm.scopes.filter((_, i) => i !== index);
  }

  async function saveEdit() {
    submitting = true;
    try {
      await api.put(`/users/${editingUserId}`, editForm);
      toast = { message: 'User updated', type: 'success' };
      editingUserId = null;
      const u = await api.get('/users');
      users = u.data || [];
    } catch (err) { toast = { message: err.message, type: 'error' }; }
    finally { submitting = false; }
  }

  function addCreateScope() {
    if (!createScopeId) return;
    form.scopes = [...form.scopes, { type: createScopeType, id: createScopeId }];
    createScopeId = '';
  }

  function removeCreateScope(index) {
    form.scopes = form.scopes.filter((_, i) => i !== index);
  }

  $: scopeOptions = newScopeType === 'warehouse' ? warehouses
    : newScopeType === 'department' ? departments
    : stores;

  $: createScopeOptions = createScopeType === 'warehouse' ? warehouses
    : createScopeType === 'department' ? departments
    : stores;
</script>

<div class="flex-between mb-2">
  <h2>Users</h2>
  <button class="btn btn-primary" on:click={() => showCreate = !showCreate}>
    {showCreate ? 'Cancel' : '+ New User'}
  </button>
</div>

{#if showCreate}
  <div class="card mb-2">
    <form on:submit|preventDefault={create}>
      <div class="grid grid-2">
        <div class="form-group"><label for="user-username">Username</label><input id="user-username" class="input" bind:value={form.username} required /></div>
        <div class="form-group"><label for="user-password">Password</label><input id="user-password" class="input" type="password" bind:value={form.password} required /></div>
        <div class="form-group"><label for="user-display-name">Display Name</label><input id="user-display-name" class="input" bind:value={form.display_name} required /></div>
        <div class="form-group"><label for="user-email">Email</label><input id="user-email" class="input" bind:value={form.email} /></div>
      </div>
      <div class="form-group">
        <label>Roles</label>
        <div class="flex gap-2">
          {#each roles as role}
            <label><input type="checkbox" value={role.name}
              on:change={(e) => {
                if (e.target.checked) form.roles = [...form.roles, role.name];
                else form.roles = form.roles.filter(r => r !== role.name);
              }} /> {role.name}</label>
          {/each}
        </div>
      </div>
      <div class="form-group">
        <label for="create-user-scope-type">Scopes</label>
        <div class="flex gap-1 mb-2">
          <select id="create-user-scope-type" class="input" style="width: 150px;" bind:value={createScopeType}>
            <option value="warehouse">Warehouse</option>
            <option value="department">Department</option>
            <option value="store">Store</option>
          </select>
          <select class="input" style="width: 200px;" bind:value={createScopeId} aria-label="Scope value">
            <option value="">Select...</option>
            {#each createScopeOptions as opt}
              <option value={opt.id}>{opt.name || opt.code || opt.id}</option>
            {/each}
          </select>
          <button class="btn" type="button" on:click={addCreateScope}>Add Scope</button>
        </div>
        {#each form.scopes as scope, i}
          <span class="badge badge-published" style="margin-right: 0.25rem;">
            {scope.type}: {scope.id}
            <button type="button" style="background:none;border:none;cursor:pointer;color:inherit;font-weight:bold;margin-left:0.25rem;" on:click={() => removeCreateScope(i)}>x</button>
          </span>
        {/each}
      </div>
      <button class="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create User'}</button>
    </form>
  </div>
{/if}

{#if loading}
  <div class="loading">Loading...</div>
{:else}
  <table>
    <thead><tr><th>Username</th><th>Display Name</th><th>Email</th><th>Roles</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>
      {#each users as u}
        <tr>
          <td>{u.username}</td>
          <td>{u.display_name}</td>
          <td class="text-sm">{u.email || '-'}</td>
          <td>{(u.roles || []).join(', ')}</td>
          <td><span class="badge badge-{u.status === 'active' ? 'published' : 'failed'}">{u.status}</span></td>
          <td>
            <button class="btn btn-sm" on:click={() => startEdit(u)}>Edit</button>
          </td>
        </tr>
        {#if editingUserId === u.id}
          <tr>
            <td colspan="6">
              <div class="card" style="margin: 0.5rem 0;">
                <h4 style="margin-bottom: 0.75rem;">Edit User: {u.username}</h4>
                <form on:submit|preventDefault={saveEdit}>
                  <div class="grid grid-2">
                    <div class="form-group">
                      <label for="edit-user-display-name">Display Name</label>
                      <input id="edit-user-display-name" class="input" bind:value={editForm.display_name} required />
                    </div>
                    <div class="form-group">
                      <label for="edit-user-email">Email</label>
                      <input id="edit-user-email" class="input" bind:value={editForm.email} />
                    </div>
                    <div class="form-group">
                      <label for="edit-user-status">Status</label>
                      <select id="edit-user-status" class="input" bind:value={editForm.status}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Roles</label>
                    <div class="flex gap-2">
                      {#each roles as role}
                        <label><input type="checkbox" value={role.name}
                          checked={editForm.roles.includes(role.name)}
                          on:change={(e) => {
                            if (e.target.checked) editForm.roles = [...editForm.roles, role.name];
                            else editForm.roles = editForm.roles.filter(r => r !== role.name);
                          }} /> {role.name}</label>
                      {/each}
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="edit-user-scope-type">Scopes</label>
                    <div class="flex gap-1 mb-2">
                      <select id="edit-user-scope-type" class="input" style="width: 150px;" bind:value={newScopeType}>
                        <option value="warehouse">Warehouse</option>
                        <option value="department">Department</option>
                        <option value="store">Store</option>
                      </select>
                      <select class="input" style="width: 200px;" bind:value={newScopeId} aria-label="Scope value">
                        <option value="">Select...</option>
                        {#each scopeOptions as opt}
                          <option value={opt.id}>{opt.name || opt.code || opt.id}</option>
                        {/each}
                      </select>
                      <button class="btn" type="button" on:click={addScope}>Add Scope</button>
                    </div>
                    {#each editForm.scopes as scope, i}
                      <span class="badge badge-published" style="margin-right: 0.25rem;">
                        {scope.type}: {scope.ref_id}
                        <button type="button" style="background:none;border:none;cursor:pointer;color:inherit;font-weight:bold;margin-left:0.25rem;" on:click={() => removeScope(i)}>x</button>
                      </span>
                    {/each}
                  </div>
                  <div class="flex gap-1">
                    <button class="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
                    <button class="btn" type="button" on:click={cancelEdit}>Cancel</button>
                  </div>
                </form>
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
{/if}

{#if toast}<Toast message={toast.message} type={toast.type} />{/if}
