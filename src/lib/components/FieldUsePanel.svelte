<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { api } from '$lib/client/api';
  import { settings, toast } from '$lib/stores';
  import { DEFAULT_USE_COLORS, type FieldUseRecord, type LocationRecord } from '$lib/schemas';
  import { formatDate, formatDuration } from '$lib/utils/format';

  export let loc: LocationRecord;
  /** Opens the "Change use" inline editor when true. */
  export let opened = false;

  const dispatch = createEventDispatcher<{
    changed: void;
  }>();

  let history: FieldUseRecord[] = [];
  let loading = false;

  let showChange = opened;
  let newType = '';
  let newStart = new Date().toISOString().slice(0, 16);
  let newNotes = '';

  let editingId: string | null = null;
  let editType = '';
  let editStart = '';
  let editEnd = '';
  let editNotes = '';

  $: useTypes = $settings?.useTypes ?? ['grazing', 'mowing', 'hay'];
  $: useColors = $settings?.useColors ?? {};
  $: currentId = loc?.id;
  $: if (currentId) reload();

  function colorForUse(t: string | null | undefined): string {
    if (!t) return '#9ca3af';
    return useColors[t] ?? DEFAULT_USE_COLORS[t] ?? '#6366f1';
  }

  async function reload(): Promise<void> {
    if (!loc) return;
    loading = true;
    try {
      const res = await api.listFieldUses(loc.id);
      history = res.items;
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function startNewUse(): Promise<void> {
    if (!newType.trim()) {
      toast('error', 'Pick a use type.');
      return;
    }
    try {
      await api.startFieldUse(loc.id, {
        use_type: newType.trim(),
        started_at: new Date(newStart).toISOString(),
        notes: newNotes || null
      });
      showChange = false;
      newType = '';
      newNotes = '';
      await reload();
      dispatch('changed');
      toast('success', 'Use updated.');
    } catch (err) {
      console.error(err);
      toast('error', 'Could not update use.');
    }
  }

  async function endCurrent(): Promise<void> {
    if (!loc.current_use) return;
    if (!confirm('End the current use? The field will be marked with no current use.')) return;
    try {
      await api.endFieldUse(loc.current_use.id);
      await reload();
      dispatch('changed');
      toast('success', 'Use ended.');
    } catch (err) {
      console.error(err);
      toast('error', 'Could not end use.');
    }
  }

  function startEdit(row: FieldUseRecord): void {
    editingId = row.id;
    editType = row.use_type;
    editStart = new Date(row.started_at).toISOString().slice(0, 16);
    editEnd = row.ended_at ? new Date(row.ended_at).toISOString().slice(0, 16) : '';
    editNotes = row.notes ?? '';
  }

  async function saveEdit(): Promise<void> {
    if (!editingId) return;
    try {
      await api.updateFieldUse(editingId, {
        use_type: editType,
        started_at: new Date(editStart).toISOString(),
        ended_at: editEnd ? new Date(editEnd).toISOString() : null,
        notes: editNotes || null
      });
      editingId = null;
      await reload();
      dispatch('changed');
      toast('success', 'Saved.');
    } catch (err) {
      console.error(err);
      toast('error', 'Could not save.');
    }
  }

  async function deleteRow(row: FieldUseRecord): Promise<void> {
    if (!confirm('Delete this history entry? This does not affect the current use.')) return;
    try {
      await api.deleteFieldUse(row.id);
      await reload();
      dispatch('changed');
      toast('success', 'Deleted.');
    } catch (err) {
      console.error(err);
      toast('error', 'Could not delete.');
    }
  }
</script>

<section class="space-y-3">
  <!-- Current use card -->
  <div class="rounded-md border border-slate-200 p-3 dark:border-slate-700">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-xs uppercase tracking-wide text-slate-500">Current use</p>
        {#if loc.current_use}
          <div class="mt-1 flex items-baseline gap-2">
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
              style="background: {colorForUse(loc.current_use.use_type)}"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-white/80"></span>
              {loc.current_use.use_type}
            </span>
            <span class="text-xs text-slate-500">
              since {formatDate(loc.current_use.started_at)}
              ({formatDuration(loc.current_use.started_at, null)})
            </span>
          </div>
          {#if loc.current_use.notes}
            <p class="mt-1 text-sm text-slate-700 dark:text-slate-300">{loc.current_use.notes}</p>
          {/if}
        {:else}
          <p class="mt-1 text-sm text-slate-500">No current use</p>
        {/if}
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1 text-xs">
        <button class="text-pasture-600 hover:underline" on:click={() => (showChange = !showChange)}>
          {loc.current_use ? 'Change use' : 'Start use'}
        </button>
        {#if loc.current_use}
          <button class="text-slate-500 hover:text-red-600" on:click={endCurrent}>End use</button>
        {/if}
      </div>
    </div>

    {#if showChange}
      <div class="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <div>
          <label class="label !text-xs" for="fu-type">Use type</label>
          <select id="fu-type" class="input !py-1.5 !text-xs" bind:value={newType}>
            <option value="">(pick)</option>
            {#each useTypes as t}
              <option value={t}>{t}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label !text-xs" for="fu-start">Started</label>
          <input
            id="fu-start"
            type="datetime-local"
            class="input !py-1.5 !text-xs"
            bind:value={newStart}
          />
        </div>
        <div>
          <label class="label !text-xs" for="fu-notes">Notes</label>
          <textarea id="fu-notes" class="input !py-1.5 !text-xs" rows="2" bind:value={newNotes}></textarea>
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn-ghost !py-1 !text-xs" on:click={() => (showChange = false)}>Cancel</button>
          <button class="btn-primary !py-1 !text-xs" on:click={startNewUse}>Save</button>
        </div>
      </div>
    {/if}
  </div>

  <!-- History -->
  <div>
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
    {#if loading}
      <p class="text-xs text-slate-400">Loading…</p>
    {:else if history.length === 0}
      <p class="text-xs text-slate-400">No prior use recorded.</p>
    {:else}
      <ul class="space-y-1.5">
        {#each history as row (row.id)}
          <li class="rounded-md border border-slate-200 p-2 text-xs dark:border-slate-700">
            {#if editingId === row.id}
              <div class="space-y-2">
                <select class="input !py-1 !text-xs" bind:value={editType}>
                  {#each useTypes as t}
                    <option value={t}>{t}</option>
                  {/each}
                </select>
                <div class="grid grid-cols-2 gap-2">
                  <input type="datetime-local" class="input !py-1 !text-xs" bind:value={editStart} />
                  <input
                    type="datetime-local"
                    class="input !py-1 !text-xs"
                    bind:value={editEnd}
                    placeholder="(still active)"
                  />
                </div>
                <input
                  type="text"
                  class="input !py-1 !text-xs"
                  placeholder="Notes"
                  bind:value={editNotes}
                />
                <div class="flex justify-end gap-2">
                  <button class="btn-ghost !py-1 !text-xs" on:click={() => (editingId = null)}>
                    Cancel
                  </button>
                  <button class="btn-primary !py-1 !text-xs" on:click={saveEdit}>Save</button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <span
                  class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style="background: {colorForUse(row.use_type)}"
                ></span>
                <div class="min-w-0 flex-1">
                  <p>
                    <span class="font-medium">{row.use_type}</span>
                    <span class="text-slate-500">
                      &middot; {formatDate(row.started_at)}
                      {#if row.ended_at}
                        → {formatDate(row.ended_at)}
                      {:else}
                        → now
                      {/if}
                      &middot; {formatDuration(row.started_at, row.ended_at)}
                    </span>
                  </p>
                  {#if row.notes}
                    <p class="mt-0.5 text-slate-600 dark:text-slate-400">{row.notes}</p>
                  {/if}
                </div>
                <div class="flex shrink-0 flex-col items-end gap-0.5">
                  <button class="text-slate-500 hover:text-pasture-600" on:click={() => startEdit(row)}>
                    Edit
                  </button>
                  <button class="text-slate-500 hover:text-red-600" on:click={() => deleteRow(row)}>
                    Delete
                  </button>
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>
