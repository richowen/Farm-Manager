<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { locations } from '$lib/stores';

  export let labelsVisible: boolean;
  export let baseLayerChoice: 'esri' | 'osm';
  export let showLines = false;
  export let showPins = true;
  export let showDonePins = true;

  const dispatch = createEventDispatcher<{
    toggleLabels: void;
    toggleBase: void;
    toggleLines: void;
    togglePins: void;
    toggleDonePins: void;
    fitAll: void;
  }>();

  let searchOpen = false;
  let search = '';
  $: matches = search
    ? $locations
        .filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 8)
    : [];

  import { selectedLocationId } from '$lib/stores';
  function pick(id: string): void {
    selectedLocationId.set(id);
    searchOpen = false;
    search = '';
  }
</script>

<div class="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex justify-center p-3">
  <div class="pointer-events-auto flex items-center gap-1 rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-black/5 backdrop-blur dark:bg-slate-800/95">
    <a
      href="/"
      class="btn-ghost !px-2 !py-1.5"
      title="Farm Manager home"
      aria-label="Home"
    >
      <svg class="h-5 w-5 text-pasture-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 21V9l9-6 9 6v12M9 21V12h6v9" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>

    <button
      class="btn-ghost !px-2 !py-1.5"
      aria-label="Search features"
      title="Search"
      on:click={() => (searchOpen = !searchOpen)}
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.35-3.35" stroke-linecap="round" />
      </svg>
    </button>

    <button
      class="btn-ghost !px-2 !py-1.5"
      title="Fit to all features"
      aria-label="Fit map to all features"
      on:click={() => dispatch('fitAll')}
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" stroke-linecap="round" />
      </svg>
    </button>

    <button
      class="btn-ghost !px-2 !py-1.5"
      class:!text-pasture-600={labelsVisible}
      title="Toggle labels"
      aria-label="Toggle labels"
      aria-pressed={labelsVisible}
      on:click={() => dispatch('toggleLabels')}
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke-linejoin="round" />
        <line x1="7" y1="7" x2="7.01" y2="7" stroke-linecap="round" />
      </svg>
    </button>

    <button
      class="btn-ghost !px-2 !py-1.5"
      title="Toggle base layer ({baseLayerChoice === 'esri' ? 'Satellite' : 'OSM'})"
      aria-label="Toggle base layer"
      on:click={() => dispatch('toggleBase')}
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m2 7 10-5 10 5-10 5L2 7z" stroke-linejoin="round" />
        <path d="m2 17 10 5 10-5M2 12l10 5 10-5" stroke-linejoin="round" />
      </svg>
    </button>

    <button
      class="btn-ghost !px-2 !py-1.5"
      class:!text-pasture-600={showLines}
      aria-pressed={showLines}
      title={showLines ? 'Hide pipes & drains' : 'Show pipes & drains'}
      aria-label="Toggle pipes and drains"
      on:click={() => dispatch('toggleLines')}
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12c3 0 3-4 6-4s3 4 6 4 3-4 6-4" stroke-linecap="round" />
      </svg>
    </button>

    <button
      class="btn-ghost !px-2 !py-1.5"
      class:!text-pasture-600={showPins}
      aria-pressed={showPins}
      title={showPins ? 'Hide pins' : 'Show pins'}
      aria-label="Toggle pins"
      on:click={() => dispatch('togglePins')}
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" stroke-linejoin="round" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    </button>

    {#if showPins}
      <button
        class="btn-ghost !px-2 !py-1.5"
        class:!text-pasture-600={showDonePins}
        aria-pressed={showDonePins}
        title={showDonePins ? 'Hide completed pins' : 'Show completed pins'}
        aria-label="Toggle completed pins"
        on:click={() => dispatch('toggleDonePins')}
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    {/if}

    <div class="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

    <a href="/timeline" class="btn-ghost !px-2 !py-1.5" title="Timeline" aria-label="Timeline">
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>

    <a href="/settings" class="btn-ghost !px-2 !py-1.5" title="Settings" aria-label="Settings">
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" stroke-linejoin="round" />
      </svg>
    </a>
  </div>
</div>

{#if searchOpen}
  <div class="pointer-events-none absolute inset-x-0 top-16 z-[1000] flex justify-center px-3">
    <div class="pointer-events-auto w-full max-w-md rounded-xl bg-white p-3 shadow-xl ring-1 ring-black/5 dark:bg-slate-800">
      <!-- svelte-ignore a11y-autofocus -->
      <input
        type="search"
        class="input"
        placeholder="Search fields and sheds…"
        bind:value={search}
        autofocus
      />
      {#if matches.length > 0}
        <ul class="mt-2 max-h-64 overflow-auto">
          {#each matches as m (m.id)}
            <li>
              <button
                class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                on:click={() => pick(m.id)}
              >
                <span
                  class="inline-block h-3 w-3 shrink-0 rounded-full"
                  style="background: {m.color ?? '#60ad6f'}"
                ></span>
                <span class="flex-1 truncate">{m.name}</span>
                <span class="text-xs uppercase text-slate-500">{m.kind}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else if search}
        <p class="mt-2 px-2 py-1 text-sm text-slate-500">No matches.</p>
      {/if}
    </div>
  </div>
{/if}
