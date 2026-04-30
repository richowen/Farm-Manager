<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { formatHa, formatAc, formatLength } from '$lib/utils/format';
  import { locations } from '$lib/stores';
  import { openOverlay } from '$lib/utils/overlay';
  import TagInput from './TagInput.svelte';

  export let kind: 'field' | 'shed' | 'line';
  export let areaHa: number | null = null;
  export let lengthM: number | null = null;
  /** For kind==='line', which subtype we're creating. Drives the default
   *  colour, palette, and label. */
  export let lineType: 'pipe' | 'drain' | null = null;

  let disposeOverlay: (() => void) | null = null;
  onMount(() => { disposeOverlay = openOverlay(() => dispatch('cancel')); });
  onDestroy(() => { disposeOverlay?.(); disposeOverlay = null; });

  const PALETTE_FIELD = ['#60ad6f', '#22c55e', '#16a34a', '#eab308', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];
  const PALETTE_SHED = ['#f59e0b', '#d97706', '#b45309', '#78350f', '#6b7280', '#374151', '#3b82f6', '#10b981', '#ec4899', '#ef4444'];
  const PALETTE_PIPE = ['#3b82f6', '#2563eb', '#1d4ed8', '#0ea5e9', '#06b6d4', '#14b8a6', '#64748b', '#475569', '#ef4444', '#a855f7'];
  const PALETTE_DRAIN = ['#92400e', '#b45309', '#a16207', '#78350f', '#57534e', '#44403c', '#64748b', '#1d4ed8', '#475569', '#6b7280'];

  $: palette =
    kind === 'field'
      ? PALETTE_FIELD
      : kind === 'line'
      ? lineType === 'drain'
        ? PALETTE_DRAIN
        : PALETTE_PIPE
      : PALETTE_SHED;

  let name = '';
  let color =
    kind === 'field'
      ? '#60ad6f'
      : kind === 'line'
      ? lineType === 'drain'
        ? '#92400e'
        : '#3b82f6'
      : '#f59e0b';
  let notes = '';
  let tags: string[] = [];
  let error = '';

  // Gather existing tags for autocomplete.
  $: tagSuggestions = Array.from(
    new Set($locations.flatMap((l) => l.tags ?? []))
  ).sort();

  $: kindLabel =
    kind === 'field'
      ? 'field'
      : kind === 'line'
      ? lineType === 'drain'
        ? 'drain'
        : lineType === 'pipe'
        ? 'water pipe'
        : 'line'
      : 'shed';

  $: namePlaceholder =
    kind === 'field'
      ? 'e.g. Top Meadow'
      : kind === 'line'
      ? lineType === 'drain'
        ? 'e.g. North field drain'
        : lineType === 'pipe'
        ? 'e.g. House supply pipe'
        : 'e.g. North drainage pipe'
      : 'e.g. Cattle Shed 1';

  const dispatch = createEventDispatcher<{
    save: { name: string; color: string; notes: string; tags: string[] };
    cancel: void;
  }>();

  function save(): void {
    if (!name.trim()) {
      error = 'Name is required.';
      return;
    }
    dispatch('save', {
      name: name.trim(),
      color,
      notes: notes.trim(),
      tags
    });
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div
  role="dialog"
  aria-modal="true"
  class="fixed inset-0 z-[2500] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
  on:click|self={() => dispatch('cancel')}
  on:keydown={(e) => e.key === 'Escape' && dispatch('cancel')}
>
  <div class="card w-full max-w-md p-5 sm:rounded-2xl">
    <h2 class="mb-1 text-lg font-semibold">
      New {kindLabel}
    </h2>
    {#if kind === 'field' && areaHa !== null}
      <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Area: <span class="font-medium">{formatHa(areaHa)}</span>
        <span class="text-slate-500">&middot; {formatAc(areaHa)}</span>
      </p>
    {:else if kind === 'line' && lengthM !== null}
      <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Length: <span class="font-medium">{formatLength(lengthM)}</span>
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
          placeholder={namePlaceholder}
          maxlength="200"
          on:keydown={(e) => e.key === 'Enter' && save()}
        />
      </div>

      <div>
        <span class="label">Colour</span>
        <div class="flex flex-wrap gap-2">
          {#each palette as c}
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
        <span class="label">Tags</span>
        <TagInput bind:value={tags} suggestions={tagSuggestions} />
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
