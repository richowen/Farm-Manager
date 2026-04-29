<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DrawMode } from '$lib/stores';
  import { formatHa, formatAc } from '$lib/utils/format';

  export let mode: DrawMode;
  export let liveAreaHa: number | null = null;

  const dispatch = createEventDispatcher<{
    drawField: void;
    drawShed: void;
    edit: void;
    save: void;
    cancel: void;
  }>();
</script>

<div class="pointer-events-none absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2">
  <div class="pointer-events-auto flex flex-col items-center gap-2">
    {#if mode === 'field' && liveAreaHa !== null}
      <div class="rounded-full bg-slate-900/90 px-3 py-1 text-xs font-medium text-white shadow">
        {formatHa(liveAreaHa)} &middot; {formatAc(liveAreaHa)}
      </div>
    {/if}

    <div class="flex items-center gap-1 rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:bg-slate-800">
      {#if mode === 'idle'}
        <button class="btn-primary" on:click={() => dispatch('drawField')} aria-label="Draw a field">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m4 20 5-16 12 3-3 12Z" stroke-linejoin="round" />
            <circle cx="4" cy="20" r="1.5" fill="currentColor" />
            <circle cx="9" cy="4" r="1.5" fill="currentColor" />
            <circle cx="21" cy="7" r="1.5" fill="currentColor" />
            <circle cx="18" cy="19" r="1.5" fill="currentColor" />
          </svg>
          <span class="hidden sm:inline">Draw field</span>
        </button>
        <button class="btn-secondary" on:click={() => dispatch('drawShed')} aria-label="Place a shed">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 11 12 4l9 7M5 10v9h14v-9" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="hidden sm:inline">Place shed</span>
        </button>
        <div class="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />
        <button class="btn-ghost" on:click={() => dispatch('edit')} aria-label="Edit features">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="hidden sm:inline">Edit</span>
        </button>
      {:else if mode === 'field'}
        <span class="px-2 text-sm text-slate-700 dark:text-slate-200">
          Tap to add vertices &middot; double-tap to finish
        </span>
        <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
      {:else if mode === 'shed'}
        <span class="px-2 text-sm text-slate-700 dark:text-slate-200">Tap where the shed is</span>
        <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
      {:else if mode === 'edit'}
        <span class="px-2 text-sm text-slate-700 dark:text-slate-200">Edit mode</span>
        <button class="btn-primary" on:click={() => dispatch('save')}>Done</button>
        <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
      {/if}
    </div>
  </div>
</div>
