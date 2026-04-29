import area from '@turf/area';
import type { FieldGeometry, PointGeometry } from '$lib/schemas';

/** Compute hectares from a GeoJSON polygon/multipolygon using turf.
 *  Returns 0 for non-polygon inputs so callers don't have to type-narrow.
 */
export function geometryToHectares(
  g: FieldGeometry | PointGeometry | null | undefined
): number {
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return 0;
  const sqm = area({ type: 'Feature', geometry: g, properties: {} });
  return sqm / 10_000;
}
