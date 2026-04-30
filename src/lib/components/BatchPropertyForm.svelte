<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { api } from '$lib/client/api';
  import { locations, settings, toast } from '$lib/stores';
  import { openOverlay } from '$lib/utils/overlay';
  import TagInput from './TagInput.svelte';

  export let ids: string[];

  let disposeOverlay: (() => void) | null = null;
  onMount(() => { disposeOverlay = openOverlay(() => dispatch('cancel')); });
  onDestroy(() => { disposeOverlay?.(); disposeOverlay = null; });

  const dispatch = createEventDispatcher<{
    saved: { count: number };
    cancel: void;
  }>();

  const PALETTE = [
    '#60ad6f', '#22c55e', '#16a34a', '#eab308', '#f59e0b',
    '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'
  ];

  let tab: 'properties' | 'use' = 'properties';
  let saving = false;

  // Properties tab state.
  let applyColor = false;
  let color = '#60ad6f';
  let applyTags = false;
  let tagsMode: 'replace' | 'add' | 'remove' = 'add';
  let tags: string[] = [];

  // Use tab state.
  let useType = '';
  let startedAt = new Date().toISOString().slice(0, 16);
  let notes = '';

  $: tagSuggestions = Array.from(new Set($locations.flatMap((l) => l.tags ?? []))).sort();
  $: useTypeOptions = $settings?.useTypes ?? ['grazing', 'mowing', 'hay'];

  async function saveProperties(): Promise<void> {
    if (!applyColor && !applyTags) {
      toast('info', 'Nothing selected to change.');
      return;
    }
    saving = true;
    try {
      await api.batchLocationsPatch({
        ids,
        patch: {
          color: applyColor ? color : undefined,
          tags: applyTags ? tags : undefined,
          tagsMode: applyTags ? tagsMode : undefined
        }
      });
      dispatch('saved', { count: ids.length });
    } catch (err) {
      console.error(err);
      toast('error', 'Save failed.');
    } finally {
      saving = false;
    }
  }

  async function saveUse(): Promise<void> {
    if (!useType.trim()) {
      toast('error', 'Pick a use type.');
      return;
    }
    saving = true;
    try {
      await api.batchLocationsPatch({
        ids,
        use: {
          use_type: useType.trim(),
          started_at: new Date(startedAt).toISOString(),
          notes: notes || null
        }
      });
      dispatch('saved', { count: ids.length });
    } catch (err) {
      console.error(err);
      toast('error', 'Save failed.');
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
      Edit {ids.length} {ids.length === 1 ? 'location' : 'locations'}
    </h2>

    <div class="my-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-700">
      <button
        class="flex-1 rounded-md px-3 py-1.5"
        class:bg-white={tab === 'properties'}
        class:dark:bg-slate-800={tab === 'properties'}
        class:font-medium={tab === 'properties'}
        on:click={() => (tab = 'properties')}
      >
        Properties
      </button>
      <button
        class="flex-1 rounded-md px-3 py-1.5"
        class:bg-white={tab === 'use'}
        class:dark:bg-slate-800={tab === 'use'}
        class:font-medium={tab === 'use'}
        on:click={() => (tab = 'use')}
      >
        Change use
      </button>
    </div>

    {#if tab === 'properties'}
      <div class="space-y-4">
        <!-- Colour -->
        <div class="rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <label class="flex items-center gap-2 font-medium">
            <input type="checkbox" bind:checked={applyColor} />
            Change colour
          </label>
          {#if applyColor}
            <div class="mt-2 flex flex-wrap gap-2">
              {#each PALETTE as c}
                <button
                  type="button"
                  class="h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800"
                  class:ring-pasture-500={color === c}
                  class:ring-transparent={color !== c}
                  style="background: {c}"
                  aria-label="Pick colour {c}"
                  on:click={() => (color = c)}
                ></button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Tags -->
        <div class="rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <label class="flex items-center gap-2 font-medium">
            <input type="checkbox" bind:checked={applyTags} />
            Change tags
          </label>
          {#if applyTags}
            <div class="mt-2 space-y-2">
              <div class="flex gap-2 text-xs">
                <label class="flex items-center gap-1">
                  <input type="radio" bind:group={tagsMode} value="add" /> Add
                </label>
                <label class="flex items-center gap-1">
                  <input type="radio" bind:group={tagsMode} value="remove" /> Remove
                </label>
                <label class="flex items-center gap-1">
                  <input type="radio" bind:group={tagsMode} value="replace" /> Replace all
                </label>
              </div>
              <TagInput bind:value={tags} suggestions={tagSuggestions} />
            </div>
          {/if}
        </div>

        <div class="flex justify-end gap-2">
          <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
          <button class="btn-primary" disabled={saving} on:click={saveProperties}>
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    {:else}
      <div class="space-y-3">
        <p class="text-sm text-slate-600 dark:text-slate-400">
          Starts a new use period on every selected location. Any previously-open use is auto-closed at the new start time.
        </p>
        <div>
          <label for="bpf-use-type" class="label">Use type</label>
          <select id="bpf-use-type" class="input" bind:value={useType}>
            <option value="">(pick one)</option>
            {#each useTypeOptions as t}
              <option value={t}>{t}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="bpf-start" class="label">Started</label>
          <input id="bpf-start" type="datetime-local" class="input" bind:value={startedAt} />
        </div>
        <div>
          <label for="bpf-notes" class="label">Notes (optional)</label>
          <textarea id="bpf-notes" class="input" rows="2" bind:value={notes}></textarea>
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
          <button class="btn-primary" disabled={saving} on:click={saveUse}>
            {saving ? 'Saving…' : 'Start use'}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
