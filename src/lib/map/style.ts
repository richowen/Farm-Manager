import type { LocationRecord } from '$lib/schemas';

/** Colour used when the user hasn't set one. Different defaults per kind. */
const DEFAULT_FIELD_COLOR = '#60ad6f';
const DEFAULT_SHED_COLOR = '#f59e0b';

export function colorFor(loc: Pick<LocationRecord, 'kind' | 'color'>): string {
  if (loc.color && /^#[0-9a-fA-F]{6}$/.test(loc.color)) return loc.color;
  return loc.kind === 'field' ? DEFAULT_FIELD_COLOR : DEFAULT_SHED_COLOR;
}

export function fieldStyle(loc: LocationRecord): L.PathOptions {
  const c = colorFor(loc);
  return {
    color: c,
    weight: 2,
    opacity: 0.95,
    fillColor: c,
    fillOpacity: 0.25
  };
}

export function fieldStyleSelected(loc: LocationRecord): L.PathOptions {
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
