<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/client/api';
  import {
    DEFAULT_PIN_CATEGORY_COLORS,
    PIN_STATUS_COLORS,
    type LocationRecord,
    type PinRecord,
    type PinStatus
  } from '$lib/schemas';
  import {
    locations,
    toast,
    settings
  } from '$lib/stores';
  import { formatRelative } from '$lib/utils/format';

  type StatusFilter = PinStatus | 'all';
  const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
    { id: 'todo', label: 'To-do' },
    { id: 'note', label: 'Notes' },
    { id: 'done', label: 'Done' },
    { id: 'all', label: 'All' }
  ];

  let activeFilter: StatusFilter = 'todo';
  let allPins: PinRecord[] = [];
  let allLocations: LocationRecord[] = [];
  let loading = false;
  let filterCategory = '';
  let filterLocation = '';

  onMount(async () => {
    try {
      const locs = await api.listLocations();
      locations.set(locs.items);
      allLocations = locs.items;
    } catch {
      /* non-fatal */
    }
    try {
      settings.set(await api.getSettings());
    } catch {
      /* non-fatal */
    }
    await reload();
  });

  async function reload(): Promise<void> {
    loading = true;
    try {
      const res = await api.listPins();
      allPins = res.items;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = '/login';
        return;
      }
      console.error(err);
      toast('error', 'Failed to load pins.');
    } finally {
      loading = false;
    }
  }

  $: categories = $settings?.pinCategories ?? [];

  function matchesFilters(p: PinRecord): boolean {
    if (filterCategory && p.category !== filterCategory) return false;
    if (filterLocation && p.location_id !== filterLocation) return false;
    return true;
  }

  $: shown = allPins.filter((p) => {
    if (!matchesFilters(p)) return false;
    if (activeFilter === 'all') return true;
    return p.status === activeFilter;
  });

  // Group by status for the all-filter view.
  $: grouped = {
    todo: shown.filter((p) => p.status === 'todo'),
    note: shown.filter((p) => p.status === 'note'),
    done: shown.filter((p) => p.status === 'done')
  };

  function categoryColor(cat: string | null): string {
    if (!cat) return '#9ca3af';
    return (
      $settings?.pinCategoryColors?.[cat] ??
      DEFAULT_PIN_CATEGORY_COLORS[cat] ??
      '#9ca3af'
    );
  }

  function locationName(id: string | null): string | null {
    if (!id) return null;
    return allLocations.find((l) => l.id === id)?.name ?? null;
  }

  function counts(key: StatusFilter): number {
    if (key === 'all') return allPins.filter(matchesFilters).length;
    return allPins.filter((p) => matchesFilters(p) && p.status === key).length;
  }

  function pinLine(p: PinRecord): string {
    if (p.title) return p.title;
    if (p.notes) return p.notes.slice(0, 80);
    if (p.category) return p.category.replaceAll('-', ' ');
    return 'Untitled pin';
  }

  const STATUS_SECTION_LABELS: Record<PinStatus, string> = {
    todo: 'To-do',
    note: 'Notes',
    done: 'Done'
  };
  const STATUS_ORDER: PinStatus[] = ['todo', 'note', 'done'];
</script>

<svelte:head>
  <title>Pins — Farm Manager</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pb-[calc(env(safe-area-inset-bottom)+5rem)] dark:bg-slate-900 sm:pb-4">
  <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
    <div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
      <a href="/" class="btn-ghost !p-2" aria-label="Back to map">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m15 18-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
      <h1 class="flex-1 text-lg font-semibold">Pins</h1>
      <a href="/" class="btn-primary !py-1.5 !text-xs" title="Drop a new pin from the map">
        + New
      </a>
    </div>
    <nav class="mx-auto flex max-w-3xl gap-1 overflow-x-auto scrollbar-none px-2 pb-2">
      {#each STATUS_FILTERS as f}
        <button
          class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
          class:bg-pasture-600={activeFilter === f.id}
          class:text-white={activeFilter === f.id}
          class:text-slate-600={activeFilter !== f.id}
          class:hover:bg-slate-100={activeFilter !== f.id}
          class:dark:text-slate-300={activeFilter !== f.id}
          class:dark:hover:bg-slate-800={activeFilter !== f.id}
          on:click={() => (activeFilter = f.id)}
        >
          {f.label}
          <span
            class="rounded-full px-1.5 py-0 text-[10px] tabular-nums"
            class:bg-white={activeFilter === f.id}
            class:text-pasture-700={activeFilter === f.id}
            class:bg-slate-200={activeFilter !== f.id}
            class:dark:bg-slate-700={activeFilter !== f.id}
          >
            {counts(f.id)}
          </span>
        </button>
      {/each}
    </nav>
    <div class="mx-auto flex max-w-3xl flex-wrap gap-2 px-4 pb-3 text-xs">
      <select bind:value={filterCategory} class="input !text-xs !py-1.5 max-w-[11rem]">
        <option value="">All categories</option>
        {#each categories as c}
          <option value={c}>{c.replaceAll('-', ' ')}</option>
        {/each}
      </select>
      <select bind:value={filterLocation} class="input !text-xs !py-1.5 max-w-[11rem]">
        <option value="">All locations</option>
        {#each allLocations as l}
          <option value={l.id}>{l.name}</option>
        {/each}
      </select>
    </div>
  </header>

  <main class="mx-auto max-w-3xl space-y-4 p-4">
    {#if loading && shown.length === 0}
      <p class="text-sm text-slate-500">Loading…</p>
    {:else if shown.length === 0}
      <div class="card p-8 text-center text-sm text-slate-500">
        {#if activeFilter === 'done'}
          No completed pins.
        {:else if activeFilter === 'note'}
          No notes yet.
        {:else if activeFilter === 'todo'}
          No outstanding pins. Tap <strong>+ New</strong> to drop one from the map.
        {:else}
          No pins yet. Drop one from the map with the FAB or long-press.
        {/if}
      </div>
    {:else if activeFilter === 'all'}
      {#each STATUS_ORDER as status}
        {#if grouped[status].length > 0}
          <section>
            <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <span
                class="inline-block h-2.5 w-2.5 rounded-full"
                style="background: {PIN_STATUS_COLORS[status]}"
              ></span>
              {STATUS_SECTION_LABELS[status]}
              <span class="text-xs font-normal text-slate-400">({grouped[status].length})</span>
            </h2>
            <ul class="card divide-y divide-slate-200 overflow-hidden dark:divide-slate-700">
              {#each grouped[status] as p (p.id)}
                <li>
                  <a
                    href={`/?pin=${p.id}`}
                    class="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    <span
                      class="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-white"
                      style="background: {categoryColor(p.category)}"
                      aria-hidden="true"
                    ></span>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-baseline justify-between gap-2">
                        <p class="truncate font-medium">{pinLine(p)}</p>
                        <time class="shrink-0 text-xs text-slate-500">
                          {formatRelative(p.created_at)}
                        </time>
                      </div>
                      <p class="text-xs text-slate-500">
                        {#if p.category}
                          <span class="capitalize">{p.category.replaceAll('-', ' ')}</span>
                        {/if}
                        {#if locationName(p.location_id)}
                          {p.category ? '·' : ''} {locationName(p.location_id)}
                        {/if}
                      </p>
                    </div>
                  </a>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      {/each}
    {:else}
      <ul class="card divide-y divide-slate-200 overflow-hidden dark:divide-slate-700">
        {#each shown as p (p.id)}
          <li>
            <a
              href={`/?pin=${p.id}`}
              class="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            >
              <span
                class="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-white"
                style="background: {categoryColor(p.category)}"
                aria-hidden="true"
              ></span>
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="truncate font-medium" class:text-slate-400={p.status === 'done'}>
                    {pinLine(p)}
                  </p>
                  <time class="shrink-0 text-xs text-slate-500">
                    {formatRelative(p.created_at)}
                  </time>
                </div>
                <p class="text-xs text-slate-500">
                  {#if p.category}
                    <span class="capitalize">{p.category.replaceAll('-', ' ')}</span>
                  {/if}
                  {#if locationName(p.location_id)}
                    {p.category ? '·' : ''} {locationName(p.location_id)}
                  {/if}
                </p>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </main>
</div>
