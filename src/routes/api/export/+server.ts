import type { RequestHandler } from './$types';
import { listLocations } from '$lib/server/repositories/locations';
import { listEvents } from '$lib/server/repositories/events';
import { getSettings } from '$lib/server/repositories/settings';
import { query } from '$lib/server/db';

/**
 * Export format:
 *   v1 — legacy, {settings, locations, events}
 *   v2 — adds {field_uses, tasks} so use history and reminders round-trip
 *
 * The default is v2. Import supports both.
 */

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
        tags: loc.tags,
        area_ha: loc.area_ha,
        length_m: loc.length_m,
        current_use: loc.current_use?.use_type ?? null
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

  const settings = await getSettings();
  const events: unknown[] = [];
  let cursor: string | null = null;
  do {
    const res = await listEvents({ limit: 200, cursor: cursor ?? undefined });
    events.push(...res.items);
    cursor = res.nextCursor;
  } while (cursor);

  // Pull full field_use history and tasks directly (small tables).
  const { rows: fieldUses } = await query(
    `SELECT id, location_id, use_type, started_at, ended_at, notes, metadata,
            created_at, updated_at
       FROM field_uses ORDER BY location_id, started_at`
  );
  const { rows: tasks } = await query(
    `SELECT id, title, notes, due_at, location_id, done_at, recurrence,
            created_at, updated_at
       FROM tasks ORDER BY created_at`
  );

  const payload = {
    version: 2,
    exported_at: new Date().toISOString(),
    settings,
    locations,
    events,
    field_uses: fieldUses,
    tasks
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
