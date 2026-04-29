import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { withTransaction } from '$lib/server/db';
import { updateSettings } from '$lib/server/repositories/settings';
import {
  createLocationSchema,
  createEventSchema,
  userSettingsSchema,
  fieldGeometrySchema,
  shedGeometrySchema
} from '$lib/schemas';

/**
 * Accepts the JSON export payload and restores it. By default it APPENDS
 * (keeps any existing data). Pass ?mode=replace to truncate first.
 */

const importPayloadSchema = z.object({
  version: z.literal(1),
  exported_at: z.string().optional(),
  settings: userSettingsSchema.partial().optional(),
  locations: z
    .array(
      z.object({
        id: z.string().uuid(),
        kind: z.enum(['field', 'shed']),
        name: z.string(),
        color: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        geometry: z.union([fieldGeometrySchema, shedGeometrySchema]),
        area_ha: z.number().nullable().optional(),
        created_at: z.string().optional(),
        updated_at: z.string().optional()
      })
    )
    .default([]),
  events: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        location_id: z.string().uuid(),
        occurred_at: z.string(),
        event_type: z.string(),
        notes: z.string().nullable().optional(),
        metadata: z.record(z.unknown()).optional()
      })
    )
    .default([])
});

export const POST: RequestHandler = async ({ request, url }) => {
  const body = await request.json().catch(() => null);
  const parsed = importPayloadSchema.safeParse(body);
  if (!parsed.success) throw error(400, 'invalid_payload: ' + parsed.error.message);
  const mode = url.searchParams.get('mode') === 'replace' ? 'replace' : 'append';

  // We validate per-row shape matches our stricter create schemas (defensively).
  for (const loc of parsed.data.locations) {
    const r = createLocationSchema.safeParse({
      kind: loc.kind,
      name: loc.name,
      color: loc.color ?? null,
      notes: loc.notes ?? null,
      geometry: loc.geometry
    });
    if (!r.success) throw error(400, `invalid location ${loc.id}: ${r.error.message}`);
  }
  for (const ev of parsed.data.events) {
    const r = createEventSchema.safeParse({
      occurred_at: ev.occurred_at,
      event_type: ev.event_type,
      notes: ev.notes ?? null,
      metadata: ev.metadata ?? {}
    });
    if (!r.success) throw error(400, `invalid event: ${r.error.message}`);
  }

  await withTransaction(async (client) => {
    if (mode === 'replace') {
      await client.query('DELETE FROM events');
      await client.query('DELETE FROM locations');
    }

    for (const loc of parsed.data.locations) {
      const geomJson = JSON.stringify(loc.geometry);
      const areaExpr =
        loc.kind === 'field'
          ? 'ST_Area(ST_GeomFromGeoJSON($6)::geography) / 10000.0'
          : 'NULL';
      await client.query(
        `INSERT INTO locations (id, kind, name, color, notes, geom, area_ha)
         VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6)::geography, ${areaExpr})
         ON CONFLICT (id) DO UPDATE SET
           kind = EXCLUDED.kind,
           name = EXCLUDED.name,
           color = EXCLUDED.color,
           notes = EXCLUDED.notes,
           geom  = EXCLUDED.geom,
           area_ha = EXCLUDED.area_ha,
           updated_at = now()`,
        [loc.id, loc.kind, loc.name, loc.color ?? null, loc.notes ?? null, geomJson]
      );
    }

    for (const ev of parsed.data.events) {
      await client.query(
        `INSERT INTO events (id, location_id, occurred_at, event_type, notes, metadata)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           location_id = EXCLUDED.location_id,
           occurred_at = EXCLUDED.occurred_at,
           event_type = EXCLUDED.event_type,
           notes = EXCLUDED.notes,
           metadata = EXCLUDED.metadata,
           updated_at = now()`,
        [
          ev.id ?? null,
          ev.location_id,
          ev.occurred_at,
          ev.event_type,
          ev.notes ?? null,
          JSON.stringify(ev.metadata ?? {})
        ]
      );
    }
  });

  if (parsed.data.settings) {
    await updateSettings(parsed.data.settings);
  }

  return json({
    ok: true,
    counts: {
      locations: parsed.data.locations.length,
      events: parsed.data.events.length
    }
  });
};
