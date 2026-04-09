<script>
  import { onMount, onDestroy } from 'svelte';
  export let expiresAt;
  export let onExpired = () => {};

  let remaining = '';
  let interval;

  function update() {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) {
      remaining = '0:00';
      onExpired();
      clearInterval(interval);
      return;
    }
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    remaining = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  onMount(() => {
    update();
    interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  });

  onDestroy(() => { if (interval) clearInterval(interval); });
</script>

<span class="countdown">{remaining}</span>
