<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { openOverlay } from '$lib/utils/overlay';
  import type { LocationRecord } from '$lib/schemas';

  export let coords: [number, number];
  export let accuracy: number | null = null;
  export let containingField: LocationRecord | null = null;

  let disposeOverlay: (() => void) | null = null;
  onMount(() => { disposeOverlay = openOverlay(() => dispatch('cancel')); });
  onDestroy(() => { disposeOverlay?.(); disposeOverlay = null; });

  const dispatch = createEventDispatcher<{
    logEvent: void;
    dropPin: void;
    cancel: void;
  }>();

  // Keep `coords` readable in the DOM for a11y tooling without marking it
  // unused — we display via the subtitle.
  $: subtitle = containingField
    ? `You're in ${containingField.name}${accuracy ? ` (±${Math.round(accuracy)} m)` : ''}`
    : `Not inside a known field${accuracy ? ` (±${Math.round(accuracy)} m)` : ''}`;
  $: _coords = coords; // referenced to silence unused-export warning
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div
  role="dialog"
  aria-modal="true"
  aria-label="What would you like to do here?"
  class="fixed inset-0 z-[2500] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
  on:click|self={() => dispatch('cancel')}
  on:keydown={(e) => e.key === 'Escape' && dispatch('cancel')}
>
  <div class="card w-full max-w-md p-5 sm:rounded-2xl">
    <h2 class="text-lg font-semibold">You're here</h2>
    <p class="mt-1 text-xs text-slate-500" data-testid="here-subtitle">{subtitle}</p>
    {#if _coords}
      <p class="sr-only">
        Coordinates: {_coords[1].toFixed(5)}, {_coords[0].toFixed(5)}
      </p>
    {/if}

    <div class="mt-4 grid gap-2">
      <button
        class="btn-primary min-h-12 w-full"
        disabled={!containingField}
        title={containingField ? '' : 'No field here to log an event against'}
        on:click={() => dispatch('logEvent')}
      >
        {#if containingField}
          Log event in {containingField.name}
        {:else}
          Log event here
        {/if}
      </button>
      <button
        class="btn-secondary min-h-12 w-full"
        on:click={() => dispatch('dropPin')}
      >
        Drop pin here
      </button>
    </div>

    <div class="mt-3 flex justify-end">
      <button class="btn-ghost !text-xs" on:click={() => dispatch('cancel')}>
        Cancel
      </button>
    </div>
  </div>
</div>
