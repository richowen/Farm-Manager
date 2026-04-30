<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import EventIcon from './EventIcon.svelte';
  import EventForm from './EventForm.svelte';
  import PhotoLightbox from './PhotoLightbox.svelte';
  import { EVENT_META } from '$lib/utils/event-types';
  import type { EventRecord, UpdateEventInput } from '$lib/schemas';
  import { formatDateTime, formatRelative } from '$lib/utils/format';
  import { api } from '$lib/client/api';
  import { toast } from '$lib/stores';

  export let event: EventRecord;

  let editing = false;
  let lightboxSrc: string | null = null;

  const dispatch = createEventDispatcher<{
    updated: EventRecord;
    deleted: { id: string };
  }>();

  async function saveEdit(
    detail: {
      occurred_at: string;
      event_type: EventRecord['event_type'];
      notes: string;
      metadata: Record<string, unknown>;
      photos: EventRecord['photos'];
    }
  ): Promise<void> {
    try {
      const patch: UpdateEventInput = {
        occurred_at: detail.occurred_at,
        event_type: detail.event_type,
        notes: detail.notes,
        metadata: detail.metadata,
        photos: detail.photos
      };
      const updated = await api.updateEvent(event.id, patch);
      dispatch('updated', updated);
      editing = false;
      toast('success', 'Event updated.');
    } catch (err) {
      console.error(err);
      toast('error', 'Could not save event.');
    }
  }

  async function deleteEvent(): Promise<void> {
    if (!confirm('Delete this event?')) return;
    try {
      await api.deleteEvent(event.id);
      dispatch('deleted', { id: event.id });
      toast('success', 'Event deleted.');
    } catch (err) {
      console.error(err);
      toast('error', 'Could not delete event.');
    }
  }

  $: meta = EVENT_META[event.event_type];
  $: metaEntries = Object.entries(event.metadata ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );
</script>

<li class="border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-700">
  {#if !editing}
    <div class="flex gap-3">
      <EventIcon type={event.event_type} size="sm" />
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline justify-between gap-2">
          <p class="truncate font-medium">{meta.label}</p>
          <time
            class="shrink-0 text-xs text-slate-500"
            title={formatDateTime(event.occurred_at)}
            datetime={event.occurred_at}
          >
            {formatRelative(event.occurred_at)}
          </time>
        </div>
        {#if metaEntries.length > 0}
          <p class="text-xs text-slate-600 dark:text-slate-400">
            {#each metaEntries as [k, v], i}
              <span><span class="text-slate-500">{k}:</span> {v}</span>
              {#if i < metaEntries.length - 1}<span class="mx-1 text-slate-400">&middot;</span>{/if}
            {/each}
          </p>
        {/if}
        {#if event.notes}
          <p class="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
            {event.notes}
          </p>
        {/if}
        {#if event.photos && event.photos.length > 0}
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each event.photos as p}
              <button
                type="button"
                class="block h-14 w-14 overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-600"
                aria-label="View photo"
                on:click={() => (lightboxSrc = `/uploads/${p.path}`)}
              >
                <img src={`/uploads/${p.path}`} alt="" class="h-full w-full object-cover" loading="lazy" />
              </button>
            {/each}
          </div>
        {/if}
        <div class="mt-1 flex gap-2 text-xs">
          <button
            class="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-pasture-600 dark:hover:bg-slate-700"
            on:click={() => (editing = true)}
          >
            Edit
          </button>
          <button class="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-700" on:click={deleteEvent}>Delete</button>
        </div>
      </div>
    </div>
  {:else}
    <div class="-mx-1 rounded-md bg-slate-50 p-3 dark:bg-slate-700/50">
      <EventForm
        initial={event}
        on:save={(e) => saveEdit(e.detail)}
        on:cancel={() => (editing = false)}
        on:delete={deleteEvent}
      />
    </div>
  {/if}
</li>

<PhotoLightbox src={lightboxSrc} on:close={() => (lightboxSrc = null)} />
