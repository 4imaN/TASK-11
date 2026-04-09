<script>
  import { goto } from '$app/navigation';
  import { isAuthenticated, loading, user } from '../stores/auth.js';
  import { login as doLogin, hasRole } from '../stores/auth.js';

  let username = '';
  let password = '';
  let error = '';
  let submitting = false;

  async function handleLogin(e) {
    e.preventDefault();
    error = '';
    submitting = true;
    try {
      const result = await doLogin(username, password);
      const roles = result.data.user.roles || [];
      // Route to the correct landing page for the user's primary role
      if (roles.includes('dispatcher') && roles.length === 1) {
        await goto('/dispatcher');
      } else if (roles.includes('buyer') && !roles.includes('admin')) {
        await goto('/buyer');
      } else {
        await goto('/admin');
      }
    } catch (err) {
      if (err.code === 'AUTH_LOCKED') {
        error = `Account locked. Try again after ${new Date(err.details?.locked_until).toLocaleTimeString()}`;
      } else {
        error = err.message || 'Login failed';
      }
    } finally {
      submitting = false;
    }
  }
</script>

{#if !$loading && !$isAuthenticated}
  <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; background: var(--bg);">
    <div class="card" style="width: 400px; border-top: 4px solid var(--primary);">
      <div style="text-align: center; font-size: 2.5rem; margin-bottom: 0.5rem;">&#x1F43E;</div>
      <h2 style="text-align: center; margin-bottom: 0.25rem; color: var(--primary);">PetMed Suite</h2>
      <p class="text-sm text-muted text-center mb-2">Vet procurement &amp; operations</p>

      {#if error}
        <div style="background: #fecaca; color: #991b1b; padding: 0.75rem; border-radius: var(--radius); margin-bottom: 1rem; font-size: 0.875rem;">
          {error}
        </div>
      {/if}

      <form on:submit={handleLogin}>
        <div class="form-group">
          <label for="username">Username</label>
          <input id="username" class="input" type="text" bind:value={username} required autocomplete="username" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input id="password" class="input" type="password" bind:value={password} required autocomplete="current-password" />
        </div>
        <button class="btn btn-primary" style="width: 100%;" type="submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div class="text-sm text-muted text-center mt-2">
        Demo: admin/password123, buyer1/password123, dispatcher1/password123
      </div>
    </div>
  </div>
{:else if $isAuthenticated}
  <div class="card">
    <h2>&#x1F43E; Welcome to PetMed Suite</h2>
    <p class="text-muted mt-1">Select a section from the sidebar to get started.</p>
  </div>
{/if}
