/**
 * Map feature styling helpers.
 * Uses `import type` for Leaflet so no Leaflet code runs at module load time
 * (safe for SSR).
 */
import type { PathOptions } from 'leaflet';
import type { LocationRecord } from '$lib/schemas';

const DEFAULT_FIELD_COLOR = '#60ad6f';
const DEFAULT_SHED_COLOR = '#f59e0b';

export function colorFor(loc: Pick<LocationRecord, 'kind' | 'color'>): string {
  if (loc.color && /^#[0-9a-fA-F]{6}$/.test(loc.color)) return loc.color;
  return loc.kind === 'field' ? DEFAULT_FIELD_COLOR : DEFAULT_SHED_COLOR;
}

export function fieldStyle(loc: LocationRecord): PathOptions {
  const c = colorFor(loc);
  return {
    color: c,
    weight: 2,
    opacity: 0.95,
    fillColor: c,
    fillOpacity: 0.25
  };
}

export function fieldStyleSelected(loc: LocationRecord): PathOptions {
  const c = colorFor(loc);
  return {
    color: '#ffffff',
    weight: 3,
    opacity: 1,
    fillColor: c,
    fillOpacity: 0.4,
    dashArray: '6 4'
  };
}
