<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatHa, formatAc } from '$lib/utils/format';

  export let kind: 'field' | 'shed';
  export let areaHa: number | null = null;

  const PALETTE = [
    '#60ad6f',
    '#22c55e',
    '#16a34a',
    '#eab308',
    '#f59e0b',
    '#ef4444',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#6b7280'
  ];

  let name = '';
  let color = kind === 'field' ? '#60ad6f' : '#f59e0b';
  let notes = '';
  let error = '';

  const dispatch = createEventDispatcher<{
    save: { name: string; color: string; notes: string };
    cancel: void;
  }>();

  function save(): void {
    if (!name.trim()) {
      error = 'Name is required.';
      return;
    }
    dispatch('save', { name: name.trim(), color, notes: notes.trim() });
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div
  role="dialog"
  aria-modal="true"
  class="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
  on:click|self={() => dispatch('cancel')}
  on:keydown={(e) => e.key === 'Escape' && dispatch('cancel')}
>
  <div class="card w-full max-w-md p-5 sm:rounded-2xl">
    <h2 class="mb-1 text-lg font-semibold">
      New {kind === 'field' ? 'field' : 'shed'}
    </h2>
    {#if kind === 'field' && areaHa !== null}
      <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Area: <span class="font-medium">{formatHa(areaHa)}</span>
        <span class="text-slate-500">&middot; {formatAc(areaHa)}</span>
      </p>
    {:else}
      <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">
        {kind === 'shed' ? 'Point location of the shed.' : ''}
      </p>
    {/if}

    <div class="space-y-3">
      <div>
        <label for="new-loc-name" class="label">Name</label>
        <!-- svelte-ignore a11y-autofocus -->
        <input
          id="new-loc-name"
          class="input"
          bind:value={name}
          autofocus
          placeholder={kind === 'field' ? 'e.g. Top Meadow' : 'e.g. Cattle Shed 1'}
          maxlength="200"
          on:keydown={(e) => e.key === 'Enter' && save()}
        />
      </div>

      <div>
        <span class="label">Colour</span>
        <div class="flex flex-wrap gap-2">
          {#each PALETTE as c}
            <button
              type="button"
              class="h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-slate-800"
              class:ring-pasture-500={color === c}
              class:ring-transparent={color !== c}
              style="background: {c}"
              aria-label="Pick colour {c}"
              on:click={() => (color = c)}
            ></button>
          {/each}
        </div>
      </div>

      <div>
        <label for="new-loc-notes" class="label">Notes (optional)</label>
        <textarea
          id="new-loc-notes"
          class="input"
          rows="2"
          bind:value={notes}
          maxlength="5000"
        ></textarea>
      </div>

      {#if error}
        <p class="text-sm text-red-600 dark:text-red-400">{error}</p>
      {/if}
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
      <button class="btn-primary" on:click={save}>Save</button>
    </div>
  </div>
</div>
