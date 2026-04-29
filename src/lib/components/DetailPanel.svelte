<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { selectedLocation, selectedLocationId, upsertLocation, toast, locations, incrementOverlay, decrementOverlay } from '$lib/stores';
  import { api, ApiError } from '$lib/client/api';
  import {
    formatArea,
    formatDate,
    formatLength,
    formatRelative
  } from '$lib/utils/format';
  import {
    EVENT_TYPES,
    type EventRecord,
    type LocationRecord,
    type PhotoRef
  } from '$lib/schemas';
  import EventRow from './EventRow.svelte';
  import EventForm from './EventForm.svelte';
  import FieldUsePanel from './FieldUsePanel.svelte';
  import TagInput from './TagInput.svelte';

  export let iAmHerePreset: {
    location_id: string | null;
    coords: [number, number];
    accuracy: number | null;
  } | null = null;

  const dispatch = createEventDispatcher<{
    locationDeleted: { id: string };
    iAmHereEventCreated: { location_id: string | null };
  }>();

  let tab: 'events' | 'details' | 'use' | 'geometry' = 'events';

  // Event list state
  let events: EventRecord[] = [];
  let eventsLoading = false;
  let nextCursor: string | null = null;
  let currentId: string | null = null;
  let eventsError = '';
  let adding = false;

  // Filters
  let filterTypes = new Set<string>();
  let filterFrom = '';
  let filterTo = '';

  // Edit name/colour/notes/tags
  let editingMeta = false;
  let metaName = '';
  let metaColor = '';
  let metaNotes = '';
  let metaTags: string[] = [];

  const TABS_BASE: Array<{ id: 'events' | 'details' | 'use' | 'geometry'; label: string }> = [
    { id: 'events', label: 'Events' },
    { id: 'use', label: 'Use' },
    { id: 'details', label: 'Details' },
    { id: 'geometry', label: 'Geometry' }
  ];
  const PALETTE = [
    '#60ad6f', '#22c55e', '#16a34a', '#eab308', '#f59e0b',
    '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'
  ];

  $: loc = $selectedLocation as LocationRecord | null;
  // Show the Use tab only for fields.
  $: TABS = TABS_BASE.filter((t) => t.id !== 'use' || loc?.kind === 'field');

  // Treat the detail panel as a full-screen overlay on mobile — hide the
  // bottom tab bar while it's open.
  let overlayIsActive = false;
  $: {
    const shouldBeActive = loc !== null;
    if (shouldBeActive && !overlayIsActive) {
      incrementOverlay();
      overlayIsActive = true;
    } else if (!shouldBeActive && overlayIsActive) {
      decrementOverlay();
      overlayIsActive = false;
    }
  }
  onDestroy(() => {
    if (overlayIsActive) {
      decrementOverlay();
      overlayIsActive = false;
    }
  });

  $: tagSuggestions = Array.from(new Set($locations.flatMap((l) => l.tags ?? []))).sort();

  $: if (loc && loc.id !== currentId) {
    currentId = loc.id;
    events = [];
    nextCursor = null;
    tab = 'events';
    metaName = loc.name;
    metaColor = loc.color ?? '';
    metaNotes = loc.notes ?? '';
    metaTags = (loc.tags ?? []).slice();
    editingMeta = false;
    loadEvents();
  }

  // Auto-open an "I am here" add form when a preset arrives for this location.
  $: if (loc && iAmHerePreset && iAmHerePreset.location_id === loc.id && !adding) {
    adding = true;
  }

  async function loadEvents(reset = true): Promise<void> {
    if (!loc) return;
    eventsLoading = true;
    eventsError = '';
    try {
      const params: Record<string, string> = {};
      if (filterTypes.size > 0) params.type = Array.from(filterTypes).join(',');
      if (filterFrom) params.from = new Date(filterFrom).toISOString();
      if (filterTo) {
        const d = new Date(filterTo);
        d.setHours(23, 59, 59, 999);
        params.to = d.toISOString();
      }
      if (!reset && nextCursor) params.cursor = nextCursor;
      const res = await api.listEvents(loc.id, params);
      events = reset ? res.items : [...events, ...res.items];
      nextCursor = res.nextCursor;
    } catch (err) {
      console.error(err);
      eventsError = 'Could not load events.';
    } finally {
      eventsLoading = false;
    }
  }

  async function handleAddEvent(detail: {
    occurred_at: string;
    event_type: EventRecord['event_type'];
    notes: string;
    metadata: Record<string, unknown>;
    photos: PhotoRef[];
  }): Promise<void> {
    if (!loc) return;
    try {
      // If this came from "I am here" we'd like to stash the GPS coords into
      // metadata so the row remembers how it was logged.
      const metadata = { ...detail.metadata };
      if (iAmHerePreset && iAmHerePreset.location_id === loc.id) {
        metadata.logged_from = 'i_am_here';
        metadata.coords = iAmHerePreset.coords;
        if (iAmHerePreset.accuracy !== null) metadata.accuracy_m = iAmHerePreset.accuracy;
      }
      const created = await api.createEvent(loc.id, {
        occurred_at: detail.occurred_at,
        event_type: detail.event_type,
        notes: detail.notes,
        metadata,
        photos: detail.photos
      });
      events = [created, ...events];
      adding = false;
      if (iAmHerePreset && iAmHerePreset.location_id === loc.id) {
        dispatch('iAmHereEventCreated', { location_id: loc.id });
      }
      toast('success', 'Event added.');
    } catch (err) {
      console.error(err);
      toast('error', 'Could not add event.');
    }
  }

  async function saveMeta(): Promise<void> {
    if (!loc) return;
    try {
      const updated = await api.updateLocation(loc.id, {
        name: metaName.trim() || loc.name,
        color: metaColor || null,
        notes: metaNotes || null,
        tags: metaTags
      });
      upsertLocation(updated);
      editingMeta = false;
      toast('success', 'Saved.');
    } catch (err) {
      console.error(err);
      toast('error', 'Save failed.');
    }
  }

  async function deleteLocation(): Promise<void> {
    if (!loc) return;
    if (!confirm(`Delete "${loc.name}" and all its events? This cannot be undone.`)) return;
    try {
      await api.deleteLocation(loc.id);
      dispatch('locationDeleted', { id: loc.id });
      toast('success', 'Deleted.');
    } catch (err) {
      if (err instanceof ApiError) toast('error', `Delete failed (${err.status}).`);
      else toast('error', 'Delete failed.');
    }
  }

  function close(): void {
    selectedLocationId.set(null);
  }

  function toggleType(t: string): void {
    if (filterTypes.has(t)) filterTypes.delete(t);
    else filterTypes.add(t);
    filterTypes = filterTypes;
    loadEvents();
  }
  function clearFilters(): void {
    filterTypes.clear();
    filterTypes = filterTypes;
    filterFrom = '';
    filterTo = '';
    loadEvents();
  }

  async function refreshLocationFromServer(): Promise<void> {
    if (!loc) return;
    try {
      const fresh = await api.getLocation(loc.id);
      upsertLocation(fresh);
    } catch {
      /* ignore */
    }
  }

  $: currentUse = loc?.current_use ?? null;
  $: hint =
    iAmHerePreset && iAmHerePreset.location_id === loc?.id && iAmHerePreset.accuracy
      ? `Logged from your GPS (±${Math.round(iAmHerePreset.accuracy)} m)`
      : null;
</script>

{#if loc}
  <aside
    class="detail-panel fixed inset-x-0 bottom-0 top-auto z-[1500] max-h-[85vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-slate-800 sm:right-0 sm:left-auto sm:top-0 sm:max-h-none sm:h-screen sm:w-[420px] sm:rounded-none sm:rounded-l-2xl"
  >
    <div class="flex h-full flex-col">
      <!-- Header -->
      <div
        class="flex items-start gap-3 border-b border-slate-200 p-4 dark:border-slate-700"
        style="border-top: 4px solid {loc.color ?? '#60ad6f'};"
      >
        <div class="min-w-0 flex-1">
          {#if !editingMeta}
            <div class="flex items-baseline gap-2">
              <h2 class="truncate text-lg font-semibold">{loc.name}</h2>
              <span class="text-xs uppercase tracking-wide text-slate-500">{loc.kind}</span>
            </div>

            {#if currentUse}
              <div class="mt-1">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full bg-pasture-600/15 px-2 py-0.5 text-xs font-medium text-pasture-800 dark:bg-pasture-600/25 dark:text-pasture-200"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-pasture-600"></span>
                  {currentUse.use_type}
                </span>
                <span class="ml-1 text-xs text-slate-500">since {formatDate(currentUse.started_at)}</span>
              </div>
            {/if}

            {#if loc.tags && loc.tags.length > 0}
              <div class="mt-1 flex flex-wrap gap-1">
                {#each loc.tags as tag}
                  <span class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    #{tag}
                  </span>
                {/each}
              </div>
            {/if}

            {#if loc.kind === 'field'}
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {formatArea(loc.area_ha, 'ha')}
              </p>
            {:else if loc.kind === 'line'}
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {#if loc.line_type === 'pipe'}
                  Water pipe ·
                {:else if loc.line_type === 'drain'}
                  Drain ·
                {/if}
                {formatLength(loc.length_m)}
                {#if loc.geometry.type === 'MultiLineString'}
                  · {loc.geometry.coordinates.length} branches
                {/if}
              </p>
            {/if}
            {#if loc.notes}
              <p class="mt-1 text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {loc.notes}
              </p>
            {/if}
            <div class="mt-2 flex gap-3 text-xs">
              <button
                class="text-slate-500 hover:text-pasture-600"
                on:click={() => (editingMeta = true)}
              >
                Edit details
              </button>
              <button class="text-slate-500 hover:text-red-600" on:click={deleteLocation}>
                Delete
              </button>
            </div>
          {:else}
            <div class="space-y-2">
              <input class="input" bind:value={metaName} maxlength="200" />
              <div class="flex flex-wrap gap-1.5">
                {#each PALETTE as c}
                  <button
                    type="button"
                    class="h-6 w-6 rounded-full ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-800"
                    class:ring-pasture-500={metaColor === c}
                    class:ring-transparent={metaColor !== c}
                    style="background: {c}"
                    on:click={() => (metaColor = c)}
                  ></button>
                {/each}
              </div>
              <TagInput bind:value={metaTags} suggestions={tagSuggestions} />
              <textarea
                class="input"
                rows="2"
                placeholder="Notes (optional)"
                bind:value={metaNotes}
                maxlength="5000"
              ></textarea>
              <div class="flex justify-end gap-2">
                <button class="btn-ghost !py-1.5 !text-xs" on:click={() => (editingMeta = false)}>
                  Cancel
                </button>
                <button class="btn-primary !py-1.5 !text-xs" on:click={saveMeta}>Save</button>
              </div>
            </div>
          {/if}
        </div>
        <button class="btn-ghost !p-2" aria-label="Close" on:click={close}>
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 6l12 12M18 6l-12 12" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 border-b border-slate-200 px-2 pt-2 dark:border-slate-700">
        {#each TABS as t}
          <button
            class="rounded-t-md px-3 py-2 text-sm font-medium"
            class:bg-pasture-600={tab === t.id}
            class:text-white={tab === t.id}
            class:text-slate-600={tab !== t.id}
            class:hover:bg-slate-100={tab !== t.id}
            class:dark:text-slate-300={tab !== t.id}
            class:dark:hover:bg-slate-700={tab !== t.id}
            on:click={() => (tab = t.id)}
          >
            {t.label}
          </button>
        {/each}
      </div>

      <!-- Tab content -->
      <div class="flex-1 overflow-auto p-4">
        {#if tab === 'events'}
          {#if !adding}
            <button class="btn-primary mb-3 w-full" on:click={() => (adding = true)}>
              + Add event
            </button>
          {:else}
            <div class="mb-3 rounded-md bg-slate-50 p-3 dark:bg-slate-700/50">
              <h3 class="mb-2 text-sm font-medium">New event</h3>
              <EventForm
                hint={hint}
                on:save={(e) => handleAddEvent(e.detail)}
                on:cancel={() => (adding = false)}
              />
            </div>
          {/if}

          <!-- Filters -->
          <details class="mb-3 text-sm">
            <summary class="cursor-pointer select-none text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
              Filter
              {#if filterTypes.size > 0 || filterFrom || filterTo}
                <span class="ml-1 text-xs text-pasture-600">(active)</span>
              {/if}
            </summary>
            <div class="mt-2 space-y-2">
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
                    {t.replaceAll('_', ' ')}
                  </button>
                {/each}
              </div>
              <div class="flex gap-2 text-xs">
                <label class="flex-1">
                  <span class="block text-slate-500">From</span>
                  <input type="date" class="input !text-xs" bind:value={filterFrom} on:change={() => loadEvents()} />
                </label>
                <label class="flex-1">
                  <span class="block text-slate-500">To</span>
                  <input type="date" class="input !text-xs" bind:value={filterTo} on:change={() => loadEvents()} />
                </label>
              </div>
              <button class="text-xs text-slate-500 hover:underline" on:click={clearFilters}>
                Clear filters
              </button>
            </div>
          </details>

          <!-- Events list -->
          {#if eventsError}
            <p class="text-sm text-red-600">{eventsError}</p>
          {/if}
          {#if events.length === 0 && !eventsLoading}
            <p class="text-sm text-slate-500">No events yet.</p>
          {/if}
          <ul>
            {#each events as e (e.id)}
              <EventRow
                event={e}
                on:updated={(ev) => {
                  const updated = ev.detail;
                  events = events.map((x) => (x.id === updated.id ? updated : x));
                }}
                on:deleted={(ev) => {
                  events = events.filter((x) => x.id !== ev.detail.id);
                }}
              />
            {/each}
          </ul>
          {#if nextCursor}
            <button
              class="btn-ghost mt-3 w-full text-sm"
              disabled={eventsLoading}
              on:click={() => loadEvents(false)}
            >
              {eventsLoading ? 'Loading…' : 'Load older'}
            </button>
          {/if}
        {:else if tab === 'use' && loc.kind === 'field'}
          <FieldUsePanel loc={loc} on:changed={refreshLocationFromServer} />
        {:else if tab === 'details'}
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-500">ID</dt>
              <dd class="font-mono text-xs">{loc.id}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-500">Created</dt>
              <dd>{formatDate(loc.created_at)}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-500">Updated</dt>
              <dd>{formatRelative(loc.updated_at)}</dd>
            </div>
            {#if loc.kind === 'field'}
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-500">Area</dt>
                <dd>{formatArea(loc.area_ha, 'ha')}</dd>
              </div>
            {:else if loc.kind === 'line'}
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-500">Length</dt>
                <dd>{formatLength(loc.length_m)}</dd>
              </div>
              {#if loc.line_type}
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">Type</dt>
                  <dd class="capitalize">{loc.line_type === 'pipe' ? 'Water pipe' : 'Drain'}</dd>
                </div>
              {/if}
              {#if loc.geometry.type === 'MultiLineString'}
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">Branches</dt>
                  <dd>{loc.geometry.coordinates.length}</dd>
                </div>
              {/if}
            {/if}
          </dl>
        {:else if tab === 'geometry'}
          <p class="mb-2 text-sm text-slate-600 dark:text-slate-400">GeoJSON:</p>
          <pre class="max-h-[40vh] overflow-auto rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-900">{JSON.stringify(loc.geometry, null, 2)}</pre>
        {/if}
      </div>
    </div>
  </aside>
{/if}

<style>
  .detail-panel::before {
    content: '';
    display: block;
    width: 40px;
    height: 4px;
    background: rgba(100, 116, 139, 0.4);
    border-radius: 2px;
    margin: 6px auto 0;
  }
  @media (min-width: 640px) {
    .detail-panel::before {
      display: none;
    }
  }
</style>
