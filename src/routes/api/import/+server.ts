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
  shedGeometrySchema,
  lineGeometrySchema
} from '$lib/schemas';

/**
 * Accepts v1, v2 or v3 export payloads.
 *   v2 adds `field_uses` and `tasks`.
 *   v3 adds `pins`.
 * In all cases we APPEND by default; `?mode=replace` truncates first.
 */

const baseLocationSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['field', 'shed', 'line']),
  name: z.string(),
  color: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  geometry: z.union([fieldGeometrySchema, shedGeometrySchema, lineGeometrySchema]),
  area_ha: z.number().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});

const baseEventSchema = z.object({
  id: z.string().uuid().optional(),
  location_id: z.string().uuid().nullable().optional(),
  occurred_at: z.string(),
  event_type: z.string(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  photos: z.array(z.unknown()).optional(),
  batch_id: z.string().uuid().nullable().optional()
});

const fieldUseRowSchema = z.object({
  id: z.string().uuid().optional(),
  location_id: z.string().uuid(),
  use_type: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional()
});

const taskRowSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string(),
  notes: z.string().nullable().optional(),
  due_at: z.string(),
  location_id: z.string().uuid().nullable().optional(),
  done_at: z.string().nullable().optional(),
  recurrence: z.enum(['none', 'weekly', 'monthly', 'yearly']).optional()
});

// Export emits lng/lat as separate numeric columns.
const pinRowSchema = z.object({
  id: z.string().uuid().optional(),
  location_id: z.string().uuid().nullable().optional(),
  lng: z.number().gte(-180).lte(180),
  lat: z.number().gte(-90).lte(90),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  status: z.enum(['todo', 'done', 'note']).optional(),
  photos: z.array(z.unknown()).optional(),
  accuracy_m: z.number().nullable().optional(),
  done_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});

const importPayloadSchema = z.object({
  version: z.literal(1).or(z.literal(2)).or(z.literal(3)),
  exported_at: z.string().optional(),
  settings: userSettingsSchema.partial().optional(),
  locations: z.array(baseLocationSchema).default([]),
  events: z.array(baseEventSchema).default([]),
  field_uses: z.array(fieldUseRowSchema).default([]),
  tasks: z.array(taskRowSchema).default([]),
  pins: z.array(pinRowSchema).default([])
});

export const POST: RequestHandler = async ({ request, url }) => {
  const body = await request.json().catch(() => null);
  const parsed = importPayloadSchema.safeParse(body);
  if (!parsed.success) throw error(400, 'invalid_payload: ' + parsed.error.message);
  const mode = url.searchParams.get('mode') === 'replace' ? 'replace' : 'append';

  // Validate per-row using strict create schemas (defensive).
  for (const loc of parsed.data.locations) {
    const r = createLocationSchema.safeParse({
      kind: loc.kind,
      name: loc.name,
      color: loc.color ?? null,
      notes: loc.notes ?? null,
      tags: loc.tags ?? [],
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
      await client.query('DELETE FROM pins');
      await client.query('DELETE FROM tasks');
      await client.query('DELETE FROM field_uses');
      await client.query('DELETE FROM events');
      await client.query('DELETE FROM locations');
    }

    for (const loc of parsed.data.locations) {
      const geomJson = JSON.stringify(loc.geometry);
      const areaExpr =
        loc.kind === 'field'
          ? 'ST_Area(ST_GeomFromGeoJSON($7)::geography) / 10000.0'
          : 'NULL';
      await client.query(
        `INSERT INTO locations (id, kind, name, color, notes, tags, geom, area_ha)
         VALUES ($1, $2, $3, $4, $5, $6::text[], ST_GeomFromGeoJSON($7)::geography, ${areaExpr})
         ON CONFLICT (id) DO UPDATE SET
           kind = EXCLUDED.kind,
           name = EXCLUDED.name,
           color = EXCLUDED.color,
           notes = EXCLUDED.notes,
           tags  = EXCLUDED.tags,
           geom  = EXCLUDED.geom,
           area_ha = EXCLUDED.area_ha,
           updated_at = now()`,
        [
          loc.id,
          loc.kind,
          loc.name,
          loc.color ?? null,
          loc.notes ?? null,
          loc.tags ?? [],
          geomJson
        ]
      );
    }

    for (const ev of parsed.data.events) {
      await client.query(
        `INSERT INTO events (id, location_id, occurred_at, event_type, notes, metadata, photos, batch_id)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
         ON CONFLICT (id) DO UPDATE SET
           location_id = EXCLUDED.location_id,
           occurred_at = EXCLUDED.occurred_at,
           event_type = EXCLUDED.event_type,
           notes = EXCLUDED.notes,
           metadata = EXCLUDED.metadata,
           photos = EXCLUDED.photos,
           batch_id = EXCLUDED.batch_id,
           updated_at = now()`,
        [
          ev.id ?? null,
          ev.location_id ?? null,
          ev.occurred_at,
          ev.event_type,
          ev.notes ?? null,
          JSON.stringify(ev.metadata ?? {}),
          JSON.stringify((ev.photos as unknown[]) ?? []),
          ev.batch_id ?? null
        ]
      );
    }

    for (const fu of parsed.data.field_uses) {
      await client.query(
        `INSERT INTO field_uses (id, location_id, use_type, started_at, ended_at, notes, metadata)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           location_id = EXCLUDED.location_id,
           use_type = EXCLUDED.use_type,
           started_at = EXCLUDED.started_at,
           ended_at = EXCLUDED.ended_at,
           notes = EXCLUDED.notes,
           metadata = EXCLUDED.metadata,
           updated_at = now()`,
        [
          fu.id ?? null,
          fu.location_id,
          fu.use_type,
          fu.started_at,
          fu.ended_at ?? null,
          fu.notes ?? null,
          JSON.stringify(fu.metadata ?? {})
        ]
      );
    }

    for (const t of parsed.data.tasks) {
      await client.query(
        `INSERT INTO tasks (id, title, notes, due_at, location_id, done_at, recurrence)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           notes = EXCLUDED.notes,
           due_at = EXCLUDED.due_at,
           location_id = EXCLUDED.location_id,
           done_at = EXCLUDED.done_at,
           recurrence = EXCLUDED.recurrence,
           updated_at = now()`,
        [
          t.id ?? null,
          t.title,
          t.notes ?? null,
          t.due_at,
          t.location_id ?? null,
          t.done_at ?? null,
          t.recurrence ?? 'none'
        ]
      );
    }

    for (const p of parsed.data.pins) {
      await client.query(
        `INSERT INTO pins (id, location_id, geom, title, notes, category, status, photos, accuracy_m, done_at)
         VALUES (
           COALESCE($1, gen_random_uuid()),
           $2,
           ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
           $5, $6, $7, $8, $9::jsonb, $10, $11
         )
         ON CONFLICT (id) DO UPDATE SET
           location_id = EXCLUDED.location_id,
           geom = EXCLUDED.geom,
           title = EXCLUDED.title,
           notes = EXCLUDED.notes,
           category = EXCLUDED.category,
           status = EXCLUDED.status,
           photos = EXCLUDED.photos,
           accuracy_m = EXCLUDED.accuracy_m,
           done_at = EXCLUDED.done_at,
           updated_at = now()`,
        [
          p.id ?? null,
          p.location_id ?? null,
          p.lng,
          p.lat,
          p.title ?? null,
          p.notes ?? null,
          p.category ?? null,
          p.status ?? 'todo',
          JSON.stringify(p.photos ?? []),
          p.accuracy_m ?? null,
          p.done_at ?? null
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
      events: parsed.data.events.length,
      field_uses: parsed.data.field_uses.length,
      tasks: parsed.data.tasks.length,
      pins: parsed.data.pins.length
    }
  });
};
