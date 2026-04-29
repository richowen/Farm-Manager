import { query } from '../db';
import {
  photoRefSchema,
  type CreatePinInput,
  type PhotoRef,
  type PinRecord,
  type PinStatus,
  type UpdatePinInput
} from '$lib/schemas';
import { z } from 'zod';

interface PinRow {
  id: string;
  location_id: string | null;
  lng: string | number;
  lat: string | number;
  title: string | null;
  notes: string | null;
  category: string | null;
  status: PinStatus;
  photos: unknown;
  accuracy_m: string | number | null;
  done_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const photosArraySchema = z.array(photoRefSchema);

function coercePhotos(raw: unknown): PhotoRef[] {
  // `raw` comes out of jsonb as a JS value already. Be defensive so a single
  // malformed row doesn't blow up the list endpoint.
  if (!Array.isArray(raw)) return [];
  const parsed = photosArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function rowToRecord(row: PinRow): PinRecord {
  const lng = typeof row.lng === 'number' ? row.lng : Number(row.lng);
  const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat);
  return {
    id: row.id,
    location_id: row.location_id,
    coords: [lng, lat],
    accuracy_m: row.accuracy_m === null ? null : Number(row.accuracy_m),
    title: row.title,
    notes: row.notes,
    category: row.category,
    status: row.status,
    photos: coercePhotos(row.photos),
    done_at: row.done_at ? row.done_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

const SELECT_COLS = `
  id,
  location_id,
  ST_X(geom::geometry) AS lng,
  ST_Y(geom::geometry) AS lat,
  title,
  notes,
  category,
  status,
  photos,
  accuracy_m,
  done_at,
  created_at,
  updated_at
`;

export interface PinFilter {
  status?: PinStatus;
  category?: string;
  location_id?: string;
}

/**
 * List pins, with to-dos floated to the top and newest first within each
 * bucket. The secondary ordering on `status = 'todo' DESC` keeps outstanding
 * work visible without needing a separate "open" filter.
 */
export async function listPins(filter: PinFilter = {}): Promise<PinRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  if (filter.category) {
    params.push(filter.category);
    where.push(`category = $${params.length}`);
  }
  if (filter.location_id) {
    params.push(filter.location_id);
    where.push(`location_id = $${params.length}`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query<PinRow>(
    `SELECT ${SELECT_COLS} FROM pins ${whereSql}
       ORDER BY (status = 'todo') DESC, created_at DESC`,
    params
  );
  return rows.map(rowToRecord);
}

export async function getPin(id: string): Promise<PinRecord | null> {
  const { rows } = await query<PinRow>(
    `SELECT ${SELECT_COLS} FROM pins WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

/**
 * Insert a new pin. If the caller didn't send `location_id`, derive it on the
 * server by asking PostGIS which field (if any) covers the drop point. That
 * keeps the snapshot accurate even if the client's copy of locations is stale.
 */
export async function createPin(input: CreatePinInput): Promise<PinRecord> {
  const [lng, lat] = input.coords;
  const photosJson = JSON.stringify(input.photos ?? []);
  // ST_Covers matches on the geography-typed geom column directly.
  const { rows } = await query<{ id: string }>(
    `INSERT INTO pins (location_id, geom, title, notes, category, status, photos, accuracy_m)
     VALUES (
       COALESCE(
         $1::uuid,
         (
           SELECT l.id
             FROM locations l
            WHERE l.kind = 'field'
              AND ST_Covers(l.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)
            LIMIT 1
         )
       ),
       ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
       $4, $5, $6, $7, $8::jsonb, $9
     )
     RETURNING id`,
    [
      input.location_id ?? null,
      lng,
      lat,
      input.title ?? null,
      input.notes ?? null,
      input.category ?? null,
      input.status ?? 'todo',
      photosJson,
      input.accuracy_m ?? null
    ]
  );
  const created = await getPin(rows[0].id);
  if (!created) throw new Error('created pin not found after insert');
  return created;
}

export async function updatePin(
  id: string,
  input: UpdatePinInput
): Promise<PinRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.title !== undefined) {
    sets.push(`title = $${idx++}`);
    params.push(input.title);
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    params.push(input.notes);
  }
  if (input.category !== undefined) {
    sets.push(`category = $${idx++}`);
    params.push(input.category);
  }
  if (input.status !== undefined) {
    sets.push(`status = $${idx++}`);
    params.push(input.status);
    // Keep `done_at` in sync with the status transition. Setting explicitly
    // here (rather than via a trigger) avoids a DB round-trip to inspect the
    // previous state.
    if (input.status === 'done') {
      sets.push(`done_at = now()`);
    } else {
      sets.push(`done_at = NULL`);
    }
  }
  if (input.photos !== undefined) {
    sets.push(`photos = $${idx++}::jsonb`);
    params.push(JSON.stringify(input.photos));
  }
  if (input.coords !== undefined) {
    sets.push(
      `geom = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)::geography`
    );
    params.push(input.coords[0], input.coords[1]);
  }
  if (input.location_id !== undefined) {
    sets.push(`location_id = $${idx++}`);
    params.push(input.location_id);
  }

  if (sets.length === 0) return getPin(id);
  params.push(id);
  const { rows } = await query<{ id: string }>(
    `UPDATE pins SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id`,
    params
  );
  if (rows.length === 0) return null;
  return getPin(rows[0].id);
}

export async function deletePin(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM pins WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

export interface PinStatusCounts {
  todo: number;
  done: number;
  note: number;
}

/** Aggregate counts for the list-page header / mobile-nav badge. */
export async function statusCounts(): Promise<PinStatusCounts> {
  const { rows } = await query<{ todo: string; done: string; note: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'todo')::text AS todo,
       COUNT(*) FILTER (WHERE status = 'done')::text AS done,
       COUNT(*) FILTER (WHERE status = 'note')::text AS note
     FROM pins`
  );
  const r = rows[0];
  return {
    todo: Number(r?.todo ?? '0'),
    done: Number(r?.done ?? '0'),
    note: Number(r?.note ?? '0')
  };
}
