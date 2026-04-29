/**
 * Map feature styling helpers.
 * Uses `import type` for Leaflet so no Leaflet code runs at module load time
 * (safe for SSR).
 */
import type { PathOptions } from 'leaflet';
import { DEFAULT_USE_COLORS, type LocationRecord, type UserSettings } from '$lib/schemas';

const DEFAULT_FIELD_COLOR = '#60ad6f';
const DEFAULT_SHED_COLOR = '#f59e0b';
const DEFAULT_LINE_COLOR = '#3b82f6';
const UNUSED_COLOR = '#9ca3af';

export function colorFor(loc: Pick<LocationRecord, 'kind' | 'color'>): string {
  if (loc.color && /^#[0-9a-fA-F]{6}$/.test(loc.color)) return loc.color;
  if (loc.kind === 'field') return DEFAULT_FIELD_COLOR;
  if (loc.kind === 'line') return DEFAULT_LINE_COLOR;
  return DEFAULT_SHED_COLOR;
}

/** When "Colour by current use" is active, map the use_type to a colour using
 *  settings.useColors (with a fallback to a sensible default palette).
 *
 *  Only field-kind locations carry `current_use` (see field_uses schema), so
 *  sheds and lines always fall back to their own location colour rather than
 *  being greyed out as "unused".
 */
export function colorForUse(
  loc: Pick<LocationRecord, 'current_use' | 'kind' | 'color'>,
  settings: UserSettings | null | undefined
): string {
  if (loc.kind !== 'field') return colorFor(loc);
  const useType = loc.current_use?.use_type;
  if (!useType) return UNUSED_COLOR;
  const explicit = settings?.useColors?.[useType];
  if (explicit && /^#[0-9a-fA-F]{6}$/.test(explicit)) return explicit;
  return DEFAULT_USE_COLORS[useType] ?? colorFor(loc);
}

export function fieldStyle(
  loc: LocationRecord,
  opts?: { colorMode?: 'location' | 'use'; settings?: UserSettings | null }
): PathOptions {
  const c =
    opts?.colorMode === 'use' ? colorForUse(loc, opts.settings) : colorFor(loc);
  // Only fields can be "unused" — sheds / lines fall back to their own colour
  // via colorForUse, so don't hatch them.
  const unused =
    opts?.colorMode === 'use' && loc.kind === 'field' && !loc.current_use;
  return {
    color: c,
    weight: 2,
    opacity: 0.95,
    fillColor: c,
    fillOpacity: unused ? 0.15 : 0.25,
    dashArray: unused ? '4 4' : undefined
  };
}

export function fieldStyleSelected(
  loc: LocationRecord,
  opts?: { colorMode?: 'location' | 'use'; settings?: UserSettings | null }
): PathOptions {
  const c =
    opts?.colorMode === 'use' ? colorForUse(loc, opts.settings) : colorFor(loc);
  return {
    color: '#ffffff',
    weight: 3,
    opacity: 1,
    fillColor: c,
    fillOpacity: 0.4,
    dashArray: '6 4'
  };
}

/** Stroke for a 'line' kind location (pipe/drain/fence). */
export function lineStyle(
  loc: LocationRecord,
  opts?: { colorMode?: 'location' | 'use'; settings?: UserSettings | null }
): PathOptions {
  const c =
    opts?.colorMode === 'use' ? colorForUse(loc, opts.settings) : colorFor(loc);
  return {
    color: c,
    weight: 4,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  };
}

export function lineStyleSelected(loc: LocationRecord): PathOptions {
  void loc;
  return {
    color: '#ffffff',
    weight: 6,
    opacity: 1,
    dashArray: '6 4',
    lineCap: 'round'
  };
}
