<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/client/api';
  import { EVENT_TYPES, type EventRecord, type LocationRecord } from '$lib/schemas';
  import { EVENT_META } from '$lib/utils/event-types';
  import EventIcon from '$lib/components/EventIcon.svelte';
  import { formatDate, formatDateTime, formatRelative } from '$lib/utils/format';
  import { toast } from '$lib/stores';

  let events: EventRecord[] = [];
  let locationsById = new Map<string, LocationRecord>();
  let nextCursor: string | null = null;
  let loading = false;

  let filterTypes = new Set<string>();
  let filterFrom = '';
  let filterTo = '';
  let filterLocation = '';
  let allLocations: LocationRecord[] = [];

  onMount(async () => {
    try {
      const locs = await api.listLocations();
      allLocations = locs.items;
      locationsById = new Map(locs.items.map((l) => [l.id, l]));
    } catch (err) {
      console.error(err);
    }
    await load(true);
  });

  async function load(reset = false): Promise<void> {
    loading = true;
    try {
      const params: Record<string, string> = {};
      if (filterTypes.size > 0) params.type = Array.from(filterTypes).join(',');
      if (filterFrom) params.from = new Date(filterFrom).toISOString();
      if (filterTo) {
        const d = new Date(filterTo);
        d.setHours(23, 59, 59, 999);
        params.to = d.toISOString();
      }
      if (filterLocation) params.location = filterLocation;
      if (!reset && nextCursor) params.cursor = nextCursor;
      const res = await api.timeline(params);
      events = reset ? res.items : [...events, ...res.items];
      nextCursor = res.nextCursor;
    } catch (err) {
      console.error(err);
      toast('error', 'Failed to load timeline.');
    } finally {
      loading = false;
    }
  }

  function toggleType(t: string): void {
    if (filterTypes.has(t)) filterTypes.delete(t);
    else filterTypes.add(t);
    filterTypes = filterTypes;
    load(true);
  }

  // Group events by date for nicer scanning
  type Group = { dateKey: string; label: string; items: EventRecord[] };
  $: grouped = groupByDate(events);

  function groupByDate(list: EventRecord[]): Group[] {
    const result: Group[] = [];
    let currentKey = '';
    for (const e of list) {
      const key = e.occurred_at.slice(0, 10);
      if (key !== currentKey) {
        result.push({ dateKey: key, label: formatDate(e.occurred_at), items: [e] });
        currentKey = key;
      } else {
        result[result.length - 1].items.push(e);
      }
    }
    return result;
  }
</script>

<svelte:head>
  <title>Timeline — Farm Manager</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-slate-900">
  <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
    <div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
      <a href="/" class="btn-ghost !p-2" aria-label="Back to map">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m15 18-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
      <h1 class="flex-1 text-lg font-semibold">Timeline</h1>
    </div>
  </header>

  <main class="mx-auto max-w-3xl p-4">
    <!-- Filters -->
    <details class="card mb-4 p-3" open>
      <summary class="cursor-pointer select-none text-sm font-medium">Filters</summary>
      <div class="mt-3 space-y-3">
        <div>
          <span class="label text-xs">Event types</span>
          <div class="flex flex-wrap gap-1">
            {#each EVENT_TYPES as t}
              <button
                class="rounded-full border px-2 py-0.5 text-xs"
                class:border-pasture-500={filterTypes.has(t)}
                class:bg-pasture-50={filterTypes.has(t)}
                class:text-pasture-800={filterTypes.has(t)}
                class:border-slate-300={!filterTypes.has(t)}
                class:dark:border-slate-600={!filterTypes.has(t)}
                class:dark:text-slate-300={!filterTypes.has(t)}
                on:click={() => toggleType(t)}
              >
                {EVENT_META[t].label}
              </button>
            {/each}
          </div>
        </div>
        <div class="grid gap-2 sm:grid-cols-3">
          <label class="text-xs">
            <span class="label !mb-1 text-xs">From</span>
            <input type="date" class="input" bind:value={filterFrom} on:change={() => load(true)} />
          </label>
          <label class="text-xs">
            <span class="label !mb-1 text-xs">To</span>
            <input type="date" class="input" bind:value={filterTo} on:change={() => load(true)} />
          </label>
          <label class="text-xs">
            <span class="label !mb-1 text-xs">Location</span>
            <select class="input" bind:value={filterLocation} on:change={() => load(true)}>
              <option value="">All</option>
              {#each allLocations as l}
                <option value={l.id}>{l.name} ({l.kind})</option>
              {/each}
            </select>
          </label>
        </div>
      </div>
    </details>

    <!-- Grouped events -->
    {#if events.length === 0 && !loading}
      <div class="card p-8 text-center text-sm text-slate-500">No events match.</div>
    {/if}

    {#each grouped as group (group.dateKey)}
      <section class="mb-6">
        <h2 class="sticky top-14 z-[5] mb-2 bg-slate-50/90 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur dark:bg-slate-900/90">
          {group.label}
        </h2>
        <ul class="card divide-y divide-slate-200 dark:divide-slate-700">
          {#each group.items as e (e.id)}
            <li class="p-3">
              <a
                class="flex items-start gap-3 no-underline"
                href={e.location_id ? `/?location=${e.location_id}` : '/'}
              >
                <EventIcon type={e.event_type} size="sm" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-2">
                    <p class="font-medium">{EVENT_META[e.event_type].label}</p>
                    <time
                      class="shrink-0 text-xs text-slate-500"
                      title={formatDateTime(e.occurred_at)}
                      datetime={e.occurred_at}
                    >
                      {formatRelative(e.occurred_at)}
                    </time>
                  </div>
                  <p class="text-xs text-slate-600 dark:text-slate-400">
                    {e.location_id
                      ? (locationsById.get(e.location_id)?.name ?? 'Unknown location')
                      : 'No location'}
                  </p>
                  {#if e.notes}
                    <p class="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                      {e.notes}
                    </p>
                  {/if}
                </div>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    {#if nextCursor}
      <button class="btn-secondary w-full" disabled={loading} on:click={() => load(false)}>
        {loading ? 'Loading…' : 'Load older'}
      </button>
    {/if}
  </main>
</div>
