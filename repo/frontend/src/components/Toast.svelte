<script>
  import { onMount, onDestroy } from 'svelte';
  export let message = '';
  export let type = 'success';
  export let duration = 3000;

  let visible = true;
  let timer = null;

  function resetTimer() {
    visible = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { visible = false; }, duration);
  }

  // React to message changes — reset visibility and restart timer
  $: if (message) {
    resetTimer();
  }

  onMount(() => {
    resetTimer();
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if visible && message}
  <div class="toast toast-{type}">
    {message}
  </div>
{/if}
