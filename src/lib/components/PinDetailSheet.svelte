<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import {
    selectedPin,
    selectedPinId,
    upsertPin,
    removePin,
    locations,
    toast
  } from '$lib/stores';
  import { openOverlay } from '$lib/utils/overlay';
  import { api, ApiError } from '$lib/client/api';
  import {
    DEFAULT_PIN_CATEGORY_COLORS,
    PIN_STATUS_COLORS,
    type LocationRecord,
    type PinStatus
  } from '$lib/schemas';
  import { formatDateTime, formatRelative } from '$lib/utils/format';
  import PinDropModal from './PinDropModal.svelte';
  import PhotoLightbox from './PhotoLightbox.svelte';
  import { settings } from '$lib/stores';

  const dispatch = createEventDispatcher<{
    editRequested: void;
  }>();

  $: pin = $selectedPin;

  // Register a history entry while the sheet is open so hardware back closes it.
  let disposeOverlay: (() => void) | null = null;
  $: {
    const shouldBe = pin !== null;
    if (shouldBe && !disposeOverlay) {
      disposeOverlay = openOverlay(() => selectedPinId.set(null));
    } else if (!shouldBe && disposeOverlay) {
      disposeOverlay();
      disposeOverlay = null;
    }
  }
  onDestroy(() => {
    if (disposeOverlay) {
      disposeOverlay();
      disposeOverlay = null;
    }
  });

  let editing = false;
  let lightboxSrc: string | null = null;
  let busy = false;
  let deleting = false;

  // Lookup the containing field by location_id snapshot; if the linked
  // location no longer exists (deleted), fall through to null.
  $: containingField = (pin?.location_id
    ? ($locations.find((l) => l.id === pin!.location_id) ?? null)
    : null) as LocationRecord | null;

  function colorForCategory(cat: string | null): string {
    if (!cat) return '#9ca3af';
    return (
      $settings?.pinCategoryColors?.[cat] ??
      DEFAULT_PIN_CATEGORY_COLORS[cat] ??
      '#9ca3af'
    );
  }

  const STATUS_LABELS: Record<PinStatus, string> = {
    note: 'Note',
    todo: 'To-do',
    done: 'Done'
  };

  function close(): void {
    selectedPinId.set(null);
  }

  async function setStatus(next: PinStatus): Promise<void> {
    if (!pin) return;
    busy = true;
    try {
      const updated = await api.updatePin(pin.id, { status: next });
      upsertPin(updated);
      toast(
        'success',
        next === 'done' ? 'Marked done.' : next === 'todo' ? 'Re-opened.' : 'Converted to note.'
      );
    } catch (err) {
      if (err instanceof ApiError) toast('error', `Update failed (${err.status}).`);
      else toast('error', 'Update failed.');
    } finally {
      busy = false;
    }
  }

  async function deletePin(): Promise<void> {
    if (!pin) return;
    const label = pin.title || pin.category || 'this pin';
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    deleting = true;
    try {
      await api.deletePin(pin.id);
      const deletedId = pin.id;
      removePin(deletedId);
      selectedPinId.set(null);
      toast('success', 'Pin deleted.');
    } catch (err) {
      if (err instanceof ApiError) toast('error', `Delete failed (${err.status}).`);
      else toast('error', 'Delete failed.');
    } finally {
      deleting = false;
    }
  }

  async function handleEditSave(detail: {
    title: string | null;
    notes: string | null;
    category: string | null;
    status: PinStatus;
    photos: import('$lib/schemas').PhotoRef[];
  }): Promise<void> {
    if (!pin) return;
    busy = true;
    try {
      const updated = await api.updatePin(pin.id, {
        title: detail.title,
        notes: detail.notes,
        category: detail.category,
        status: detail.status,
        photos: detail.photos
      });
      upsertPin(updated);
      editing = false;
      toast('success', 'Pin updated.');
    } catch (err) {
      if (err instanceof ApiError) toast('error', `Save failed (${err.status}).`);
      else toast('error', 'Save failed.');
    } finally {
      busy = false;
    }
  }

  // Opening the edit modal counts as the edit-requested signal for tests.
  function openEdit(): void {
    editing = true;
    dispatch('editRequested');
  }
</script>

{#if pin}
  <aside
    class="pin-sheet fixed inset-x-0 bottom-0 top-auto z-[1500] max-h-[75vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-slate-800 sm:right-0 sm:left-auto sm:top-0 sm:max-h-none sm:h-screen sm:w-[380px] sm:rounded-none sm:rounded-l-2xl"
  >
    <div class="flex h-full flex-col">
      <!-- Header -->
      <div
        class="flex items-start gap-3 border-b border-slate-200 p-4 dark:border-slate-700"
        style="border-top: 4px solid {PIN_STATUS_COLORS[pin.status]};"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-white/80"
              style="background: {colorForCategory(pin.category)}"
              aria-hidden="true"
            ></span>
            <h2 class="truncate text-lg font-semibold">
              {pin.title || (pin.category ? pin.category.replaceAll('-', ' ') : 'Untitled pin')}
            </h2>
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
              style="background: {PIN_STATUS_COLORS[pin.status]}"
            >
              {STATUS_LABELS[pin.status]}
            </span>
          </div>
          <p class="mt-1 text-xs text-slate-500">
            {formatRelative(pin.created_at)}
            {#if containingField}
              · in <a
                class="text-pasture-600 hover:underline"
                href={`/?location=${containingField.id}`}
              >{containingField.name}</a>
            {/if}
            {#if pin.accuracy_m}
              · ±{Math.round(pin.accuracy_m)}&nbsp;m
            {/if}
          </p>
          {#if pin.category}
            <p class="mt-0.5 text-xs capitalize text-slate-500">
              {pin.category.replaceAll('-', ' ')}
            </p>
          {/if}
          {#if pin.notes}
            <p class="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
              {pin.notes}
            </p>
          {/if}
          {#if pin.photos.length > 0}
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each pin.photos as p}
                <button
                  type="button"
                  class="block h-14 w-14 overflow-hidden rounded ring-1 ring-slate-200 dark:ring-slate-700"
                  aria-label="View photo"
                  on:click={() => (lightboxSrc = `/uploads/${p.path}`)}
                >
                  <img src={`/uploads/${p.path}`} alt="" class="h-full w-full object-cover" loading="lazy" />
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="flex flex-col items-end gap-1">
          <button class="btn-ghost !p-2" aria-label="Close" on:click={close}>
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 6l12 12M18 6l-12 12" stroke-linecap="round" />
            </svg>
          </button>
          <button
            class="btn-ghost !p-2"
            aria-label="Edit pin"
            title="Edit pin"
            on:click={openEdit}
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Action row -->
      <div class="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
        {#if pin.status !== 'done'}
          <button
            class="btn-primary flex-1 min-w-[8rem]"
            disabled={busy}
            on:click={() => setStatus('done')}
          >
            Mark done
          </button>
        {/if}
        {#if pin.status === 'done'}
          <button
            class="btn-primary flex-1 min-w-[8rem]"
            disabled={busy}
            on:click={() => setStatus('todo')}
          >
            Re-open
          </button>
        {/if}
        {#if pin.status !== 'note'}
          <button
            class="btn-secondary flex-1 min-w-[8rem]"
            disabled={busy}
            on:click={() => setStatus('note')}
          >
            Convert to note
          </button>
        {:else}
          <button
            class="btn-secondary flex-1 min-w-[8rem]"
            disabled={busy}
            on:click={() => setStatus('todo')}
          >
            Make to-do
          </button>
        {/if}
      </div>

      <!-- Footer -->
      <div class="mt-auto flex items-center justify-between border-t border-slate-200 p-3 text-xs dark:border-slate-700">
        <span class="text-slate-500" title={formatDateTime(pin.updated_at)}>
          Updated {formatRelative(pin.updated_at)}
        </span>
        <button
          class="text-slate-500 hover:text-red-600"
          disabled={deleting}
          on:click={deletePin}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </aside>
{/if}

{#if pin && editing}
  <PinDropModal
    mode="edit"
    initial={pin}
    coords={pin.coords}
    accuracy_m={pin.accuracy_m}
    containingField={containingField}
    saving={busy}
    deleting={deleting}
    on:save={(e) => handleEditSave(e.detail)}
    on:cancel={() => (editing = false)}
    on:delete={() => deletePin()}
  />
{/if}

<PhotoLightbox src={lightboxSrc} on:close={() => (lightboxSrc = null)} />

<style>
  .pin-sheet::before {
    content: '';
    display: block;
    width: 40px;
    height: 4px;
    background: rgba(100, 116, 139, 0.4);
    border-radius: 2px;
    margin: 6px auto 0;
  }
  @media (min-width: 640px) {
    .pin-sheet::before {
      display: none;
    }
  }
</style>
