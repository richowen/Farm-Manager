import { writable, derived, type Writable } from 'svelte/store';
import type { LocationKind, LocationRecord, PinRecord, UserSettings } from '$lib/schemas';

// ---- Locations --------------------------------------------------------------
export const locations: Writable<LocationRecord[]> = writable([]);
export const locationsLoaded = writable(false);

export function upsertLocation(loc: LocationRecord): void {
  locations.update((list) => {
    const idx = list.findIndex((l) => l.id === loc.id);
    if (idx === -1) return [...list, loc];
    const next = list.slice();
    next[idx] = loc;
    return next;
  });
}

export function upsertManyLocations(list: LocationRecord[]): void {
  for (const l of list) upsertLocation(l);
}

export function removeLocation(id: string): void {
  locations.update((list) => list.filter((l) => l.id !== id));
}

// ---- Single selection (details panel) --------------------------------------
export const selectedLocationId = writable<string | null>(null);

export const selectedLocation = derived(
  [locations, selectedLocationId],
  ([$locs, $id]) => ($id ? $locs.find((l) => l.id === $id) ?? null : null)
);

// ---- Multi-select (batch actions) -------------------------------------------
/**
 * Set of location IDs currently in the multi-select. `multiSelectMode` is a
 * separate flag because we want a dedicated toggle button — clicks on features
 * only add to the set when the mode is active; otherwise they open the detail
 * panel as normal.
 */
export const multiSelectMode = writable<boolean>(false);
export const selectedIds = writable<Set<string>>(new Set<string>());

export function toggleSelection(id: string): void {
  selectedIds.update((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}
export function addSelection(ids: string[]): void {
  if (ids.length === 0) return;
  selectedIds.update((s) => {
    const next = new Set(s);
    for (const id of ids) next.add(id);
    return next;
  });
}
export function clearSelection(): void {
  selectedIds.set(new Set<string>());
}

export const selectionCount = derived(selectedIds, ($s) => $s.size);

/** The unique `LocationKind` if all selected items share one, else null. */
export const selectionKind = derived(
  [selectedIds, locations],
  ([$ids, $locs]): LocationKind | null => {
    if ($ids.size === 0) return null;
    let kind: LocationKind | null = null;
    for (const id of $ids) {
      const loc = $locs.find((l) => l.id === id);
      if (!loc) continue;
      if (kind === null) kind = loc.kind;
      else if (kind !== loc.kind) return null;
    }
    return kind;
  }
);

// ---- Draw mode --------------------------------------------------------------
export type DrawMode = 'idle' | 'field' | 'shed' | 'line' | 'edit' | 'pin';
export const drawMode = writable<DrawMode>('idle');

// ---- Pins -------------------------------------------------------------------
export const pins: Writable<PinRecord[]> = writable([]);
export const pinsLoaded = writable(false);

export function upsertPin(p: PinRecord): void {
  pins.update((list) => {
    const idx = list.findIndex((x) => x.id === p.id);
    if (idx === -1) return [...list, p];
    const next = list.slice();
    next[idx] = p;
    return next;
  });
}

export function removePin(id: string): void {
  pins.update((list) => list.filter((p) => p.id !== id));
}

/** Currently-open pin detail sheet, by id. Mirrors `selectedLocationId`. */
export const selectedPinId = writable<string | null>(null);
export const selectedPin = derived(
  [pins, selectedPinId],
  ([$pins, $id]) => ($id ? $pins.find((p) => p.id === $id) ?? null : null)
);

// ---- Map colouring ----------------------------------------------------------
export type ColorMode = 'location' | 'use';
export const colorMode = writable<ColorMode>('location');

// ---- Online/offline ---------------------------------------------------------
export const online = writable<boolean>(
  typeof navigator !== 'undefined' ? navigator.onLine : true
);
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => online.set(true));
  window.addEventListener('offline', () => online.set(false));
}

// ---- Toasts -----------------------------------------------------------------
export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error' | 'warning';
  message: string;
  /** Optional action — if provided, rendered as a button on the toast. */
  action?: { label: string; onClick: () => void };
}

export const toasts = writable<Toast[]>([]);
let _toastId = 0;

export function toast(
  kind: Toast['kind'],
  message: string,
  ttlMs = 4000,
  action?: Toast['action']
): number {
  const id = ++_toastId;
  toasts.update((list) => [...list, { id, kind, message, action }]);
  if (ttlMs > 0) {
    setTimeout(() => {
      toasts.update((list) => list.filter((t) => t.id !== id));
    }, ttlMs);
  }
  return id;
}

export function dismissToast(id: number): void {
  toasts.update((list) => list.filter((t) => t.id !== id));
}

// ---- User settings (client-side cache) -------------------------------------
export const settings = writable<UserSettings | null>(null);

// ---- Overlay count ----------------------------------------------------------
/**
 * Count of "full-screen-ish" overlays currently open (detail panel, new
 * location modal, batch forms, task editor, photo lightbox, etc.). When > 0
 * the mobile tab bar is hidden so it doesn't eat screen space from a focused
 * dialog. Components call `incrementOverlay()` on mount and
 * `decrementOverlay()` on destroy.
 */
export const overlayCount = writable<number>(0);

export function incrementOverlay(): void {
  overlayCount.update((n) => n + 1);
}
export function decrementOverlay(): void {
  overlayCount.update((n) => (n > 0 ? n - 1 : 0));
}
