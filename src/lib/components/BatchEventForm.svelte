<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { api } from '$lib/client/api';
  import { locations, toast } from '$lib/stores';
  import { openOverlay } from '$lib/utils/overlay';
  import EventForm from './EventForm.svelte';
  import type { PhotoRef } from '$lib/schemas';

  export let ids: string[];

  let disposeOverlay: (() => void) | null = null;
  onMount(() => { disposeOverlay = openOverlay(() => dispatch('cancel')); });
  onDestroy(() => { disposeOverlay?.(); disposeOverlay = null; });

  const dispatch = createEventDispatcher<{
    saved: { batchId: string; count: number };
    cancel: void;
  }>();

  let saving = false;
  $: selected = $locations.filter((l) => ids.includes(l.id));

  function drop(id: string): void {
    ids = ids.filter((x) => x !== id);
  }

  async function handleSave(detail: {
    occurred_at: string;
    event_type: string;
    notes: string;
    metadata: Record<string, unknown>;
    photos: PhotoRef[];
  }) {
    if (ids.length === 0) {
      toast('error', 'No locations selected.');
      return;
    }
    saving = true;
    try {
      const res = await api.batchEvent({
        location_ids: ids,
        event: {
          occurred_at: detail.occurred_at,
          event_type: detail.event_type as never,
          notes: detail.notes,
          metadata: detail.metadata,
          photos: detail.photos
        }
      });
      dispatch('saved', { batchId: res.batch_id, count: res.items.length });
    } catch (err) {
      console.error(err);
      toast('error', 'Could not save batch event.');
    } finally {
      saving = false;
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div
  role="dialog"
  aria-modal="true"
  class="fixed inset-0 z-[2500] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
  on:click|self={() => dispatch('cancel')}
  on:keydown={(e) => e.key === 'Escape' && dispatch('cancel')}
>
  <div class="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 sm:rounded-2xl">
    <h2 class="text-lg font-semibold">
      Log event on {ids.length} {ids.length === 1 ? 'location' : 'locations'}
    </h2>
    <p class="mt-1 text-xs text-slate-500">
      One event per location, grouped by a shared batch id so you can undo or edit as a unit.
    </p>

    <div class="my-3 flex flex-wrap gap-1.5">
      {#each selected as l (l.id)}
        <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700">
          {l.name}
          <button
            type="button"
            class="text-slate-400 hover:text-red-600"
            aria-label="Remove {l.name}"
            on:click={() => drop(l.id)}
          >
            ×
          </button>
        </span>
      {/each}
    </div>

    <EventForm
      on:save={(e) => handleSave(e.detail)}
      on:cancel={() => dispatch('cancel')}
    />
    {#if saving}
      <p class="mt-2 text-xs text-slate-500">Saving…</p>
    {/if}
  </div>
</div>
