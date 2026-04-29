import { writable, derived, type Writable } from 'svelte/store';
import type { LocationRecord } from '$lib/schemas';

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

export function removeLocation(id: string): void {
  locations.update((list) => list.filter((l) => l.id !== id));
}

// ---- Selection --------------------------------------------------------------
export const selectedLocationId = writable<string | null>(null);

export const selectedLocation = derived(
  [locations, selectedLocationId],
  ([$locs, $id]) => ($id ? $locs.find((l) => l.id === $id) ?? null : null)
);

// ---- Draw mode --------------------------------------------------------------
export type DrawMode = 'idle' | 'field' | 'shed' | 'edit';
export const drawMode = writable<DrawMode>('idle');

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
}

export const toasts = writable<Toast[]>([]);
let _toastId = 0;

export function toast(kind: Toast['kind'], message: string, ttlMs = 4000): void {
  const id = ++_toastId;
  toasts.update((list) => [...list, { id, kind, message }]);
  if (ttlMs > 0) {
    setTimeout(() => {
      toasts.update((list) => list.filter((t) => t.id !== id));
    }, ttlMs);
  }
}

export function dismissToast(id: number): void {
  toasts.update((list) => list.filter((t) => t.id !== id));
}

// ---- User settings (client-side cache) -------------------------------------
import type { UserSettings } from '$lib/schemas';
export const settings = writable<UserSettings | null>(null);
