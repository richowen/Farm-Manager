import area from '@turf/area';
import length from '@turf/length';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import booleanIntersects from '@turf/boolean-intersects';
import type {
  FieldGeometry,
  LineStringGeometry,
  LocationRecord,
  PointGeometry
} from '$lib/schemas';

/** Compute hectares from a GeoJSON polygon/multipolygon using turf.
 *  Returns 0 for non-polygon inputs so callers don't have to type-narrow.
 */
export function geometryToHectares(
  g: FieldGeometry | PointGeometry | LineStringGeometry | null | undefined
): number {
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return 0;
  const sqm = area({ type: 'Feature', geometry: g, properties: {} });
  return sqm / 10_000;
}

/** Compute a LineString length in metres. Turf returns km by default. */
export function lineLengthMeters(g: LineStringGeometry | null | undefined): number {
  if (!g || g.type !== 'LineString') return 0;
  const km = length({ type: 'Feature', geometry: g, properties: {} }, { units: 'kilometers' });
  return km * 1000;
}

/**
 * Find the first location whose geometry contains the given lat/lng. Polygons
 * use point-in-polygon; points and lines return null (we don't consider them
 * for "I am standing inside this feature").
 */
export function findContainingLocation(
  locations: LocationRecord[],
  lat: number,
  lng: number
): LocationRecord | null {
  const pt = { type: 'Point' as const, coordinates: [lng, lat] as [number, number] };
  for (const loc of locations) {
    if (loc.kind !== 'field') continue;
    try {
      const feat = {
        type: 'Feature' as const,
        geometry: loc.geometry as FieldGeometry,
        properties: {}
      };
      if (booleanPointInPolygon(pt, feat)) return loc;
    } catch {
      /* ignore malformed geometry */
    }
  }
  return null;
}

/**
 * Return the IDs of every location whose geometry intersects the given
 * polygon (used for lasso/rectangle multi-select).
 */
export function locationsIntersecting(
  locations: LocationRecord[],
  selectionPolygon: FieldGeometry
): string[] {
  const selection = {
    type: 'Feature' as const,
    geometry: selectionPolygon,
    properties: {}
  };
  const out: string[] = [];
  for (const loc of locations) {
    try {
      const feat = {
        type: 'Feature' as const,
        geometry: loc.geometry as GeoJSON.Geometry,
        properties: {}
      };
      if (booleanIntersects(selection, feat)) out.push(loc.id);
    } catch {
      /* ignore */
    }
  }
  return out;
}
