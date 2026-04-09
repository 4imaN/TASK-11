<script>
  export let slots = [];
  export let selectedIds = [];
  export let onSelect = () => {};

  let adjacencyWarning = '';

  $: rows = groupByRow(slots);

  function groupByRow(slots) {
    const map = {};
    for (const s of slots) {
      if (!map[s.row_code]) map[s.row_code] = [];
      map[s.row_code].push(s);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.position_index - b.position_index);
    }
    return map;
  }

  function validateAdjacency(selectedPositions, allSlots, rowCode) {
    const rowSlots = allSlots
      .filter(s => s.row_code === rowCode)
      .sort((a, b) => a.position_index - b.position_index);

    if (rowSlots.length === 0) return [];

    const maxPos = rowSlots[rowSlots.length - 1].position_index;
    const minPos = rowSlots[0].position_index;

    const selectedSet = new Set(selectedPositions);
    const occupiedOrSelected = new Set();

    for (const slot of rowSlots) {
      if (slot.status !== 'available' || selectedSet.has(slot.position_index)) {
        occupiedOrSelected.add(slot.position_index);
      }
    }

    const errors = [];
    for (let pos = minPos; pos <= maxPos; pos++) {
      if (occupiedOrSelected.has(pos)) continue;

      const leftOccupied = pos === minPos || occupiedOrSelected.has(pos - 1);
      const rightOccupied = pos === maxPos || occupiedOrSelected.has(pos + 1);

      if (leftOccupied && rightOccupied) {
        const isRowEnd = pos === minPos || pos === maxPos;
        if (!isRowEnd) {
          errors.push(`Selection would leave a single-seat gap at position ${pos} in row ${rowCode}`);
        }
      }
    }

    return errors;
  }

  function toggle(slot) {
    if (slot.status !== 'available') return;
    const idx = selectedIds.indexOf(slot.id);
    let candidateIds;
    if (idx >= 0) {
      candidateIds = selectedIds.filter(id => id !== slot.id);
    } else {
      candidateIds = [...selectedIds, slot.id];
    }

    // Validate adjacency for each affected row
    const candidateSlots = slots.filter(s => candidateIds.includes(s.id));
    const affectedRows = new Set(candidateSlots.map(s => s.row_code));
    // Also check the row of the toggled slot
    affectedRows.add(slot.row_code);

    let allErrors = [];
    for (const rowCode of affectedRows) {
      const rowSelectedPositions = candidateSlots
        .filter(s => s.row_code === rowCode)
        .map(s => s.position_index);
      const errors = validateAdjacency(rowSelectedPositions, slots, rowCode);
      allErrors = allErrors.concat(errors);
    }

    if (allErrors.length > 0) {
      adjacencyWarning = allErrors[0];
      return;
    }

    adjacencyWarning = '';
    selectedIds = candidateIds;
    onSelect(selectedIds);
  }

  function getClass(slot) {
    if (selectedIds.includes(slot.id)) return 'seat seat-selected';
    if (slot.status === 'available') return 'seat seat-available';
    if (slot.status === 'held') return 'seat seat-held';
    if (slot.status === 'reserved') return 'seat seat-reserved';
    return 'seat seat-unavailable';
  }
</script>

{#if adjacencyWarning}
  <div class="card mb-2" style="background: #fef3c7; padding: 0.5rem 1rem; font-size: 0.875rem; color: #92400e;">
    {adjacencyWarning}
  </div>
{/if}

{#each Object.entries(rows) as [rowCode, rowSlots]}
  <div class="mb-2">
    <strong class="text-sm">{rowCode}</strong>
    <div class="seat-grid mt-1">
      {#each rowSlots as slot}
        <button
          class={getClass(slot)}
          on:click={() => toggle(slot)}
          disabled={slot.status !== 'available' && !selectedIds.includes(slot.id)}
          title="{rowCode}-{slot.position_index} ({slot.status})"
        >
          {slot.position_index}
        </button>
      {/each}
    </div>
  </div>
{/each}
