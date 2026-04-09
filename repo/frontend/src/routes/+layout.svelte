<script>
  import { onMount, afterUpdate } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { checkAuth, user, loading, logout, isAuthenticated, hasPermission, userPermissions, userRoles, hasRole } from '../stores/auth.js';
  import { isOnline } from '$lib/offlineApi.js';
  import { pendingMutations } from '$lib/mutationQueue.js';
  import '../app.css';

  let currentPath = '';
  let sidebarOpen = false;

  onMount(async () => {
    await checkAuth();
  });

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  $: currentPath = $page.url.pathname;

  async function handleLogout() {
    await logout();
    await goto('/', { replaceState: true, invalidateAll: true });
  }

  $: perms = $userPermissions;
  $: roles = $userRoles;
  $: showAdmin = hasPermission(perms, 'admin.*') || hasPermission(perms, 'catalog.*');
  $: showBuyer = hasPermission(perms, 'cart.*') || hasRole(roles, 'buyer');
  $: showDispatcher = hasPermission(perms, 'task.*') || hasRole(roles, 'dispatcher');
  $: showOutcomes = hasPermission(perms, 'outcomes.*');
</script>

{#if $loading}
  <div class="loading" style="height: 100vh; align-items: center;">Loading...</div>
{:else if !$isAuthenticated}
  {#if currentPath.startsWith('/admin') || currentPath.startsWith('/buyer') || currentPath.startsWith('/dispatcher')}
    {goto('/')}
  {:else}
    <slot />
  {/if}
{:else}
  <div class="topbar">
    <div class="flex gap-1" style="align-items: center;">
      <button class="hamburger-btn" on:click={toggleSidebar} aria-label="Toggle menu">&#9776;</button>
      <h1>&#x1F43E; PetMed Suite</h1>
    </div>
    <div class="flex gap-2" style="align-items: center;">
      {#if !$isOnline}
        <span style="background: var(--warning); color: var(--text); padding: 0.25rem 0.75rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;">Offline — using cached data</span>
      {/if}
      {#if $pendingMutations > 0}
        <span style="background: var(--accent); color: white; padding: 0.25rem 0.75rem; border-radius: var(--radius); font-size: 0.8rem; font-weight: 600;">{$pendingMutations} pending sync</span>
      {/if}
      <span class="text-sm text-muted">{$user?.display_name} ({$user?.roles?.join(', ')})</span>
      <button class="btn btn-sm" on:click={handleLogout}>Logout</button>
    </div>
  </div>

  <div class="sidebar" class:sidebar-open={sidebarOpen}>
    {#if showAdmin}
      <div style="padding: 0.5rem 1.5rem; font-size: 0.7rem; text-transform: uppercase; color: var(--text-light); font-weight: 600;">Admin</div>
      <a href="/admin" class:active={currentPath === '/admin'}>Dashboard</a>
      <a href="/admin/products" class:active={currentPath.startsWith('/admin/products')}>Products</a>
      <a href="/admin/suppliers" class:active={currentPath.startsWith('/admin/suppliers')}>Suppliers</a>
      <a href="/admin/inventory" class:active={currentPath.startsWith('/admin/inventory')}>Inventory</a>
      <a href="/admin/import" class:active={currentPath.startsWith('/admin/import')}>Import/Export</a>
      <a href="/admin/users" class:active={currentPath.startsWith('/admin/users')}>Users</a>
      <a href="/admin/config" class:active={currentPath.startsWith('/admin/config')}>Config</a>
      <a href="/admin/audit" class:active={currentPath.startsWith('/admin/audit')}>Audit Logs</a>
      <a href="/admin/integration" class:active={currentPath.startsWith('/admin/integration')}>Integration</a>
    {/if}

    {#if showBuyer}
      <div style="padding: 0.5rem 1.5rem; font-size: 0.7rem; text-transform: uppercase; color: var(--text-light); font-weight: 600;">Buyer</div>
      <a href="/buyer" class:active={currentPath === '/buyer'}>Catalog</a>
      <a href="/buyer/cart" class:active={currentPath.startsWith('/buyer/cart')}>Cart</a>
      <a href="/buyer/holds" class:active={currentPath.startsWith('/buyer/holds')}>Seat Holds</a>
    {/if}

    {#if showDispatcher}
      <div style="padding: 0.5rem 1.5rem; font-size: 0.7rem; text-transform: uppercase; color: var(--text-light); font-weight: 600;">Dispatch</div>
      <a href="/dispatcher" class:active={currentPath === '/dispatcher'}>Task Board</a>
      <a href="/dispatcher/recommendations" class:active={currentPath.startsWith('/dispatcher/recommendations')}>Recommended</a>
    {/if}

    {#if showOutcomes}
      <div style="padding: 0.5rem 1.5rem; font-size: 0.7rem; text-transform: uppercase; color: var(--text-light); font-weight: 600;">Outcomes</div>
      <a href="/admin/outcomes" class:active={currentPath.startsWith('/admin/outcomes')}>Outcomes</a>
      <a href="/admin/projects" class:active={currentPath.startsWith('/admin/projects')}>Projects</a>
    {/if}
  </div>

  <div class="main-content" style="padding-top: 5rem;">
    {#if currentPath.startsWith('/admin/outcomes') || currentPath.startsWith('/admin/projects')}
      {#if showOutcomes}
        <slot />
      {:else}
        <div class="card" style="margin: 2rem; padding: 2rem; text-align: center;">
          <h2>Not Authorized</h2>
          <p class="text-muted mt-1">You do not have permission to access this page.</p>
        </div>
      {/if}
    {:else if currentPath.startsWith('/admin')}
      {#if showAdmin}
        <slot />
      {:else}
        <div class="card" style="margin: 2rem; padding: 2rem; text-align: center;">
          <h2>Not Authorized</h2>
          <p class="text-muted mt-1">You do not have permission to access this page.</p>
        </div>
      {/if}
    {:else if currentPath.startsWith('/buyer')}
      {#if showBuyer}
        <slot />
      {:else}
        <div class="card" style="margin: 2rem; padding: 2rem; text-align: center;">
          <h2>Not Authorized</h2>
          <p class="text-muted mt-1">You do not have permission to access this page.</p>
        </div>
      {/if}
    {:else if currentPath.startsWith('/dispatcher')}
      {#if showDispatcher}
        <slot />
      {:else}
        <div class="card" style="margin: 2rem; padding: 2rem; text-align: center;">
          <h2>Not Authorized</h2>
          <p class="text-muted mt-1">You do not have permission to access this page.</p>
        </div>
      {/if}
    {:else}
      <slot />
    {/if}
  </div>
{/if}
