import type { RequestHandler } from './$types';
import { listLocations } from '$lib/server/repositories/locations';
import { listEvents } from '$lib/server/repositories/events';
import { getSettings } from '$lib/server/repositories/settings';

export const GET: RequestHandler = async ({ url }) => {
  const format = url.searchParams.get('format') ?? 'json';
  const locations = await listLocations();

  if (format === 'geojson') {
    const features = locations.map((loc) => ({
      type: 'Feature' as const,
      id: loc.id,
      geometry: loc.geometry,
      properties: {
        kind: loc.kind,
        name: loc.name,
        color: loc.color,
        notes: loc.notes,
        area_ha: loc.area_ha
      }
    }));
    const body = JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
    return new Response(body, {
      headers: {
        'content-type': 'application/geo+json',
        'content-disposition': `attachment; filename="farm-manager-${dateStamp()}.geojson"`
      }
    });
  }

  // Full JSON export
  const settings = await getSettings();
  // We'll grab events in chunks to avoid memory blow-up on large DBs.
  const events: unknown[] = [];
  let cursor: string | null = null;
  do {
    const res = await listEvents({ limit: 200, cursor: cursor ?? undefined });
    events.push(...res.items);
    cursor = res.nextCursor;
  } while (cursor);

  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    settings,
    locations,
    events
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="farm-manager-${dateStamp()}.json"`
    }
  });
};

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
