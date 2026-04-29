<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { EVENT_META, EVENT_TYPE_GROUPS } from '$lib/utils/event-types';
  import { EVENT_TYPES, type EventRecord, type EventType } from '$lib/schemas';
  import {
    fromDatetimeLocalInput,
    toDatetimeLocalInput
  } from '$lib/utils/format';

  export let initial: EventRecord | null = null;

  const dispatch = createEventDispatcher<{
    save: {
      occurred_at: string;
      event_type: EventType;
      notes: string;
      metadata: Record<string, unknown>;
    };
    cancel: void;
    delete: void;
  }>();

  let occurredInput: string = toDatetimeLocalInput(
    (initial?.occurred_at as string) ?? new Date().toISOString()
  );
  let eventType: EventType = (initial?.event_type as EventType) ?? 'inspection';
  let notes = initial?.notes ?? '';
  let metadata: Record<string, string | number> = {
    ...(initial?.metadata as Record<string, string | number> | undefined)
  };

  // Optional structured fields per event type — all stored in `metadata`.
  interface FieldDef {
    key: string;
    label: string;
    type: 'number' | 'text';
    unit?: string;
    placeholder?: string;
  }
  const FIELDS_BY_TYPE: Partial<Record<EventType, FieldDef[]>> = {
    fertilizer: [
      { key: 'product', label: 'Product', type: 'text', placeholder: 'e.g. CAN 27' },
      { key: 'rate_kg_ha', label: 'Rate', type: 'number', unit: 'kg/ha' }
    ],
    slurry: [{ key: 'rate_m3_ha', label: 'Rate', type: 'number', unit: 'm³/ha' }],
    lime: [{ key: 'rate_t_ha', label: 'Rate', type: 'number', unit: 't/ha' }],
    spray: [
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'rate_l_ha', label: 'Rate', type: 'number', unit: 'L/ha' }
    ],
    worming: [{ key: 'product', label: 'Product', type: 'text' }],
    vet_treatment: [{ key: 'product', label: 'Treatment', type: 'text' }],
    cattle_in: [
      { key: 'count', label: 'Head count', type: 'number' },
      { key: 'from', label: 'From (location)', type: 'text' }
    ],
    cattle_out: [
      { key: 'count', label: 'Head count', type: 'number' },
      { key: 'to', label: 'To (location)', type: 'text' }
    ],
    grazing_start: [{ key: 'count', label: 'Head count', type: 'number' }],
    grazing_end: [{ key: 'count', label: 'Head count', type: 'number' }],
    harvest_silage: [
      { key: 'bales', label: 'Bales', type: 'number' },
      { key: 'tonnes', label: 'Tonnes', type: 'number', unit: 't' }
    ],
    harvest_hay: [
      { key: 'bales', label: 'Bales', type: 'number' },
      { key: 'tonnes', label: 'Tonnes', type: 'number', unit: 't' }
    ],
    reseed: [{ key: 'mix', label: 'Seed mix', type: 'text' }]
  };

  $: currentFields = FIELDS_BY_TYPE[eventType] ?? [];

  function setNow(): void {
    occurredInput = toDatetimeLocalInput(new Date().toISOString());
  }
  function setYesterday(): void {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    occurredInput = toDatetimeLocalInput(d.toISOString());
  }
  function setLastWeek(): void {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    occurredInput = toDatetimeLocalInput(d.toISOString());
  }

  let error = '';
  function save(): void {
    error = '';
    if (!occurredInput) {
      error = 'Date is required.';
      return;
    }
    const cleanedMetadata: Record<string, unknown> = {};
    for (const f of currentFields) {
      const v = metadata[f.key];
      if (v === undefined || v === null || v === '') continue;
      if (f.type === 'number') {
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        if (!Number.isNaN(n)) cleanedMetadata[f.key] = n;
      } else {
        cleanedMetadata[f.key] = String(v);
      }
    }
    dispatch('save', {
      occurred_at: fromDatetimeLocalInput(occurredInput),
      event_type: eventType,
      notes,
      metadata: cleanedMetadata
    });
  }

  // Group types for the select (for nicer UX).
  $: groupedTypes = EVENT_TYPE_GROUPS.map((g) => ({
    ...g,
    types: EVENT_TYPES.filter((t) => EVENT_META[t].group === g.id)
  }));
</script>

<div class="space-y-4">
  <div>
    <span class="label">When</span>
    <div class="flex flex-wrap gap-2">
      <input
        type="datetime-local"
        class="input flex-1"
        bind:value={occurredInput}
      />
    </div>
    <div class="mt-1 flex gap-2 text-xs">
      <button type="button" class="text-pasture-600 hover:underline" on:click={setNow}>Now</button>
      <span class="text-slate-400">&middot;</span>
      <button type="button" class="text-pasture-600 hover:underline" on:click={setYesterday}>Yesterday</button>
      <span class="text-slate-400">&middot;</span>
      <button type="button" class="text-pasture-600 hover:underline" on:click={setLastWeek}>Last week</button>
    </div>
  </div>

  <div>
    <label for="ev-type" class="label">Type</label>
    <select id="ev-type" class="input" bind:value={eventType}>
      {#each groupedTypes as g}
        <optgroup label={g.label}>
          {#each g.types as t}
            <option value={t}>{EVENT_META[t].label}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </div>

  {#if currentFields.length > 0}
    <div class="grid grid-cols-2 gap-3">
      {#each currentFields as f}
        <div class={currentFields.length === 1 ? 'col-span-2' : ''}>
          <label for={`ev-${f.key}`} class="label">
            {f.label}{#if f.unit} <span class="text-slate-500">({f.unit})</span>{/if}
          </label>
          {#if f.type === 'number'}
            <input
              id={`ev-${f.key}`}
              type="number"
              step="any"
              class="input"
              placeholder={f.placeholder ?? ''}
              bind:value={metadata[f.key]}
            />
          {:else}
            <input
              id={`ev-${f.key}`}
              type="text"
              class="input"
              placeholder={f.placeholder ?? ''}
              bind:value={metadata[f.key]}
            />
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div>
    <label for="ev-notes" class="label">Notes</label>
    <textarea
      id="ev-notes"
      class="input"
      rows="3"
      bind:value={notes}
      placeholder="Anything worth remembering…"
      maxlength="5000"
    ></textarea>
  </div>

  {#if error}
    <p class="text-sm text-red-600 dark:text-red-400">{error}</p>
  {/if}

  <div class="flex items-center justify-between gap-2">
    {#if initial}
      <button class="btn-danger !py-1.5 !text-xs" on:click={() => dispatch('delete')}>
        Delete
      </button>
    {:else}
      <span></span>
    {/if}
    <div class="flex gap-2">
      <button class="btn-ghost" on:click={() => dispatch('cancel')}>Cancel</button>
      <button class="btn-primary" on:click={save}>{initial ? 'Save' : 'Add event'}</button>
    </div>
  </div>
</div>
