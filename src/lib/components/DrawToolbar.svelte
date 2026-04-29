<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DrawMode } from '$lib/stores';
  import { formatHa, formatAc, formatLength } from '$lib/utils/format';

  export let mode: DrawMode;
  export let liveAreaHa: number | null = null;
  export let liveLineM: number | null = null;
  export let selectModeActive = false;
  export let colorMode: 'location' | 'use' = 'location';
  /** Type of line currently being composed, if any — drives button colour and
   *  the finish-chip labels. */
  export let lineDraftType: 'pipe' | 'drain' | null = null;
  /** How many branches have been drawn so far in the current line draft. */
  export let lineDraftBranchCount = 0;

  const dispatch = createEventDispatcher<{
    drawField: void;
    drawShed: void;
    drawPipe: void;
    drawDrain: void;
    addBranch: void;
    finishLine: void;
    edit: void;
    save: void;
    cancel: void;
    toggleSelect: void;
    lassoSelect: void;
    toggleColorMode: void;
  }>();
</script>

<div
  class="pointer-events-none absolute left-1/2 z-[1000] -translate-x-1/2"
  style="bottom: calc(var(--fm-nav-inset) + 1rem);"
>
  <div class="pointer-events-auto flex flex-col items-center gap-2">
    {#if mode === 'field' && liveAreaHa !== null}
      <div class="rounded-full bg-slate-900/90 px-3 py-1 text-xs font-medium text-white shadow">
        {formatHa(liveAreaHa)} &middot; {formatAc(liveAreaHa)}
      </div>
    {/if}
    {#if mode === 'line' && liveLineM !== null}
      <div class="rounded-full bg-slate-900/90 px-3 py-1 text-xs font-medium text-white shadow">
        {formatLength(liveLineM)}
      </div>
    {/if}

    <div class="flex items-center gap-1 rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:bg-slate-800">
      {#if mode === 'idle'}
        <button
          class="btn-primary min-h-11 min-w-11"
          on:click={() => dispatch('drawField')}
          aria-label="Draw a field"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m4 20 5-16 12 3-3 12Z" stroke-linejoin="round" />
            <circle cx="4" cy="20" r="1.5" fill="currentColor" />
            <circle cx="9" cy="4" r="1.5" fill="currentColor" />
            <circle cx="21" cy="7" r="1.5" fill="currentColor" />
            <circle cx="18" cy="19" r="1.5" fill="currentColor" />
          </svg>
          <span class="hidden sm:inline">Field</span>
        </button>
        <button
          class="btn-secondary min-h-11 min-w-11"
          on:click={() => dispatch('drawShed')}
          aria-label="Place a shed"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 11 12 4l9 7M5 10v9h14v-9" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="hidden sm:inline">Shed</span>
        </button>
        <button
          class="btn-secondary min-h-11 min-w-11"
          on:click={() => dispatch('drawPipe')}
          aria-label="Draw a water pipe"
          title="Draw a water pipe (branching supported)"
        >
          <svg class="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12c3 0 3-4 6-4s3 4 6 4 3-4 6-4" stroke-linecap="round" />
            <circle cx="3" cy="12" r="1.2" fill="currentColor" />
            <circle cx="21" cy="8" r="1.2" fill="currentColor" />
          </svg>
          <span class="hidden sm:inline">Pipe</span>
        </button>
        <button
          class="btn-secondary min-h-11 min-w-11"
          on:click={() => dispatch('drawDrain')}
          aria-label="Draw a drain"
          title="Draw a drainage channel (branching supported)"
        >
          <svg class="h-5 w-5" style="color:#92400e" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 8 L10 8 L10 16 L21 16" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 3" />
            <circle cx="3" cy="8" r="1.2" fill="currentColor" />
            <circle cx="21" cy="16" r="1.2" fill="currentColor" />
          </svg>
          <span class="hidden sm:inline">Drain</span>
        </button>
        <div class="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />
        <button
          class="btn-ghost min-h-11 min-w-11"
          class:!text-pasture-600={selectModeActive}
          class:!bg-pasture-50={selectModeActive}
          aria-pressed={selectModeActive}
          on:click={() => dispatch('toggleSelect')}
          aria-label="Toggle multi-select mode"
          title="Select multiple features"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h5M4 12h5M4 18h5M15 6h5M15 12h5M15 18h5" stroke-linecap="round" />
            <rect x="10" y="4" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
            <rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
            <rect x="10" y="16" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
          </svg>
        </button>
        {#if selectModeActive}
          <button
            class="btn-ghost min-h-11 min-w-11"
            on:click={() => dispatch('lassoSelect')}
            aria-label="Lasso-select a rectangular area"
            title="Box-select"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h4M10 6h4M16 6h4M4 18h4M10 18h4M16 18h4M4 10v4M20 10v4" stroke-linecap="round" />
            </svg>
          </button>
        {/if}
        <button
          class="btn-ghost min-h-11 min-w-11"
          on:click={() => dispatch('edit')}
          aria-label="Edit features"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="hidden sm:inline">Edit</span>
        </button>
        <div class="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />
        <button
          class="btn-ghost min-h-11 min-w-11"
          class:!text-pasture-600={colorMode === 'use'}
          aria-pressed={colorMode === 'use'}
          on:click={() => dispatch('toggleColorMode')}
          title={colorMode === 'use' ? 'Colouring by current use — click for location colours' : 'Colour fields by current use'}
          aria-label="Toggle colour mode"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4v16M4 12h16" />
          </svg>
        </button>
      {:else if mode === 'field'}
        <span class="px-2 text-sm text-slate-700 dark:text-slate-200">
          Tap to add vertices &middot; double-tap to finish
        </span>
        <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
      {:else if mode === 'shed'}
        <span class="px-2 text-sm text-slate-700 dark:text-slate-200">Tap where the shed is</span>
        <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
      {:else if mode === 'line'}
        {#if lineDraftBranchCount === 0}
          <span class="px-2 text-sm text-slate-700 dark:text-slate-200">
            {lineDraftType === 'drain' ? 'Draw drain' : 'Draw pipe'} · tap to add points, double-tap to finish
          </span>
          <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
        {:else}
          <span class="px-2 text-sm text-slate-700 dark:text-slate-200">
            {lineDraftBranchCount} {lineDraftBranchCount === 1 ? 'branch' : 'branches'} drawn
          </span>
          <button
            class="btn-secondary"
            on:click={() => dispatch('addBranch')}
            title="Snap to an existing vertex to branch off"
          >
            + Branch
          </button>
          <button class="btn-primary" on:click={() => dispatch('finishLine')}>Finish</button>
          <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
        {/if}
      {:else if mode === 'edit'}
        <span class="px-2 text-sm text-slate-700 dark:text-slate-200">Edit mode</span>
        <button class="btn-primary" on:click={() => dispatch('save')}>Done</button>
        <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
      {/if}
    </div>
  </div>
</div>
