<script>
  export let qty = 0;
  export let reserved = 0;
  export let warning = 15;
  export let critical = 5;

  $: effective = qty - reserved;
  $: state = effective <= critical ? 'critical' : effective <= warning ? 'warning' : 'normal';
</script>

<span class="badge badge-{state}" title="Available: {effective} (Warning: {warning}, Critical: {critical})">
  {effective} {state === 'critical' ? 'CRITICAL' : state === 'warning' ? 'LOW' : 'OK'}
</span>
