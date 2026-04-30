<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import {
    settings
  } from '$lib/stores';
  import { openOverlay } from '$lib/utils/overlay';
  import {
    DEFAULT_PIN_CATEGORIES,
    DEFAULT_PIN_CATEGORY_COLORS,
    PIN_STATUSES,
    type LocationRecord,
    type PhotoRef,
    type PinRecord,
    type PinStatus
  } from '$lib/schemas';
  import PhotoInput from './PhotoInput.svelte';

  export let mode: 'create' | 'edit' = 'create';
  export let initial: Partial<PinRecord> = {};
  export let coords: [number, number];
  export let accuracy_m: number | null = null;
  export let containingField: LocationRecord | null = null;
  export let saving = false;
  export let deleting = false;

  let disposeOverlay: (() => void) | null = null;
  onMount(() => { disposeOverlay = openOverlay(() => dispatch('cancel')); });
  onDestroy(() => { disposeOverlay?.(); disposeOverlay = null; });

  let title: string = initial.title ?? '';
  let notes: string = initial.notes ?? '';
  let category: string | null = initial.category ?? null;
  let status: PinStatus = (initial.status ?? 'todo') as PinStatus;
  let photos: PhotoRef[] = (initial.photos ?? []) as PhotoRef[];

  // Categories / colours come from settings, falling back to the built-in
  // defaults on a stale cache.
  $: categories =
    $settings?.pinCategories && $settings.pinCategories.length > 0
      ? $settings.pinCategories
      : [...DEFAULT_PIN_CATEGORIES];
  $: categoryColors = $settings?.pinCategoryColors ?? {};

  function colorFor(cat: string): string {
    return categoryColors[cat] ?? DEFAULT_PIN_CATEGORY_COLORS[cat] ?? '#9ca3af';
  }

  function pickCategory(c: string): void {
    // Tap again to clear; otherwise select.
    category = category === c ? null : c;
  }

  const STATUS_LABELS: Record<PinStatus, string> = {
    note: 'Note',
    todo: 'To-do',
    done: 'Done'
  };

  const dispatch = createEventDispatcher<{
    save: {
      title: string | null;
      notes: string | null;
      category: string | null;
      status: PinStatus;
      photos: PhotoRef[];
    };
    cancel: void;
    delete: void;
  }>();

  function save(): void {
    dispatch('save', {
      title: title.trim() ? title.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
      category: category ?? null,
      status,
      photos
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
  <div class="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5 sm:rounded-2xl">
    <div class="mb-3 flex items-baseline justify-between gap-2">
      <h2 class="text-lg font-semibold">{mode === 'edit' ? 'Edit pin' : 'New pin'}</h2>
      <span class="text-xs text-slate-500">
        {coords[1].toFixed(5)}, {coords[0].toFixed(5)}
        {#if accuracy_m}
          · ±{Math.round(accuracy_m)}&nbsp;m
        {/if}
      </span>
    </div>

    {#if containingField}
      <p class="mb-3 text-xs text-slate-500">
        You're in <strong>{containingField.name}</strong>
      </p>
    {/if}

    <div class="space-y-3">
      <div>
        <label for="pin-title" class="label">Title (optional)</label>
        <!-- svelte-ignore a11y-autofocus -->
        <input
          id="pin-title"
          class="input"
          bind:value={title}
          autofocus
          placeholder="What's here?"
          maxlength="200"
        />
      </div>

      <div>
        <span class="label">Category</span>
        <div class="flex flex-wrap gap-1.5">
          {#each categories as c}
            {@const active = category === c}
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize"
              class:border-transparent={active}
              class:text-white={active}
              class:border-slate-300={!active}
              class:text-slate-700={!active}
              class:dark:border-slate-600={!active}
              class:dark:text-slate-300={!active}
              style={active ? `background:${colorFor(c)}` : ''}
              on:click={() => pickCategory(c)}
            >
              <span
                class="inline-block h-2.5 w-2.5 rounded-full"
                style="background: {colorFor(c)}"
              ></span>
              {c.replaceAll('-', ' ')}
            </button>
          {/each}
        </div>
      </div>

      <div>
        <span class="label">Status</span>
        <div class="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
          {#each PIN_STATUSES as s}
            <button
              type="button"
              class="px-3 py-1.5 text-sm font-medium"
              class:bg-pasture-600={status === s}
              class:text-white={status === s}
              class:text-slate-600={status !== s}
              class:hover:bg-slate-100={status !== s}
              class:dark:text-slate-300={status !== s}
              class:dark:hover:bg-slate-700={status !== s}
              on:click={() => (status = s)}
            >
              {STATUS_LABELS[s]}
            </button>
          {/each}
        </div>
      </div>

      <div>
        <label for="pin-notes" class="label">Notes</label>
        <textarea
          id="pin-notes"
          class="input"
          rows="3"
          bind:value={notes}
          maxlength="5000"
        ></textarea>
      </div>

      <div>
        <span class="label">Photos</span>
        <PhotoInput bind:value={photos} />
      </div>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      {#if mode === 'edit'}
        <button
          type="button"
          class="btn-ghost mr-auto !text-red-600"
          disabled={deleting || saving}
          on:click={() => dispatch('delete')}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      {/if}
      <button class="btn-ghost" disabled={saving} on:click={() => dispatch('cancel')}>
        Cancel
      </button>
      <button class="btn-primary" disabled={saving} on:click={save}>
        {saving ? 'Saving…' : mode === 'edit' ? 'Save' : 'Create'}
      </button>
    </div>
  </div>
</div>
