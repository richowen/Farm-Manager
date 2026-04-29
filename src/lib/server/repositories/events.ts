import { query } from '../db';
import type {
  CreateEventInput,
  EventRecord,
  EventType,
  PhotoRef,
  UpdateEventInput
} from '$lib/schemas';
import crypto from 'node:crypto';

interface EventRow {
  id: string;
  location_id: string | null;
  occurred_at: Date;
  event_type: EventType;
  notes: string | null;
  metadata: Record<string, unknown>;
  photos: PhotoRef[];
  batch_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    location_id: row.location_id,
    occurred_at: row.occurred_at.toISOString(),
    event_type: row.event_type,
    notes: row.notes,
    metadata: row.metadata ?? {},
    photos: Array.isArray(row.photos) ? row.photos : [],
    batch_id: row.batch_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

const SELECT_COLS =
  'id, location_id, occurred_at, event_type, notes, metadata, photos, batch_id, created_at, updated_at';

export interface ListEventsOptions {
  locationId?: string;
  /** If true, include events with NO location (batch=false, standalone points). */
  includeStandalone?: boolean;
  types?: EventType[];
  from?: string;
  to?: string;
  batchId?: string;
  limit?: number;
  cursor?: string;
}

export interface ListEventsResult {
  items: EventRecord[];
  nextCursor: string | null;
}

function encodeCursor(row: EventRecord): string {
  return `${row.occurred_at}|${row.id}`;
}

function decodeCursor(cursor: string): { occurredAt: string; id: string } | null {
  const parts = cursor.split('|');
  if (parts.length !== 2) return null;
  return { occurredAt: parts[0], id: parts[1] };
}

export async function listEvents(opts: ListEventsOptions = {}): Promise<ListEventsResult> {
  const where: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.locationId) {
    where.push(`location_id = $${idx++}`);
    params.push(opts.locationId);
  }
  if (opts.types && opts.types.length > 0) {
    where.push(`event_type = ANY($${idx++}::text[])`);
    params.push(opts.types);
  }
  if (opts.from) {
    where.push(`occurred_at >= $${idx++}`);
    params.push(opts.from);
  }
  if (opts.to) {
    where.push(`occurred_at <= $${idx++}`);
    params.push(opts.to);
  }
  if (opts.batchId) {
    where.push(`batch_id = $${idx++}`);
    params.push(opts.batchId);
  }
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (c) {
      where.push(`(occurred_at, id) < ($${idx++}, $${idx++})`);
      params.push(c.occurredAt, c.id);
    }
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  params.push(limit + 1);

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query<EventRow>(
    `SELECT ${SELECT_COLS} FROM events ${whereSql}
     ORDER BY occurred_at DESC, id DESC
     LIMIT $${idx}`,
    params
  );
  const records = rows.map(rowToRecord);
  let nextCursor: string | null = null;
  if (records.length > limit) {
    const truncated = records.slice(0, limit);
    nextCursor = encodeCursor(truncated[truncated.length - 1]);
    return { items: truncated, nextCursor };
  }
  return { items: records, nextCursor };
}

export async function getEvent(id: string): Promise<EventRecord | null> {
  const { rows } = await query<EventRow>(
    `SELECT ${SELECT_COLS} FROM events WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function createEvent(
  locationId: string | null,
  input: CreateEventInput
): Promise<EventRecord> {
  const { rows } = await query<EventRow>(
    `INSERT INTO events (location_id, occurred_at, event_type, notes, metadata, photos)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     RETURNING ${SELECT_COLS}`,
    [
      locationId,
      input.occurred_at,
      input.event_type,
      input.notes ?? null,
      JSON.stringify(input.metadata ?? {}),
      JSON.stringify(input.photos ?? [])
    ]
  );
  return rowToRecord(rows[0]);
}

export async function updateEvent(
  id: string,
  input: UpdateEventInput
): Promise<EventRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (input.occurred_at !== undefined) {
    sets.push(`occurred_at = $${idx++}`);
    params.push(input.occurred_at);
  }
  if (input.event_type !== undefined) {
    sets.push(`event_type = $${idx++}`);
    params.push(input.event_type);
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    params.push(input.notes);
  }
  if (input.metadata !== undefined) {
    sets.push(`metadata = $${idx++}::jsonb`);
    params.push(JSON.stringify(input.metadata));
  }
  if (input.photos !== undefined) {
    sets.push(`photos = $${idx++}::jsonb`);
    params.push(JSON.stringify(input.photos));
  }
  if (sets.length === 0) return getEvent(id);
  params.push(id);
  const { rows } = await query<EventRow>(
    `UPDATE events SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING ${SELECT_COLS}`,
    params
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function deleteEvent(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM events WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

// ---- Batch operations -------------------------------------------------------

/**
 * Create a single event on each of the given location ids sharing a single
 * batch_id. All rows are inserted in one multi-VALUES statement so a batch
 * of 500 fields is one round-trip, not 500.
 */
export async function createBatch(
  locationIds: string[],
  input: CreateEventInput
): Promise<{ batchId: string; events: EventRecord[] }> {
  if (locationIds.length === 0) throw new Error('location_ids empty');
  const batchId = crypto.randomUUID();

  // Shared params first so they only appear once in the query, then one
  // ordinal per location id. Mirrors fieldUses.startUseMany.
  const params: unknown[] = [
    input.occurred_at,
    input.event_type,
    input.notes ?? null,
    JSON.stringify(input.metadata ?? {}),
    JSON.stringify(input.photos ?? []),
    batchId
  ];
  const values: string[] = [];
  locationIds.forEach((lid, i) => {
    const ordinal = 7 + i;
    values.push(`($${ordinal}, $1, $2, $3, $4::jsonb, $5::jsonb, $6)`);
    params.push(lid);
  });

  const { rows } = await query<EventRow>(
    `INSERT INTO events (location_id, occurred_at, event_type, notes, metadata, photos, batch_id)
     VALUES ${values.join(', ')}
     RETURNING ${SELECT_COLS}`,
    params
  );
  return { batchId, events: rows.map(rowToRecord) };
}

export async function getBatch(batchId: string): Promise<EventRecord[]> {
  const { rows } = await query<EventRow>(
    `SELECT ${SELECT_COLS} FROM events WHERE batch_id = $1
       ORDER BY occurred_at DESC, id DESC`,
    [batchId]
  );
  return rows.map(rowToRecord);
}

export async function updateBatch(
  batchId: string,
  input: UpdateEventInput
): Promise<EventRecord[]> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (input.occurred_at !== undefined) {
    sets.push(`occurred_at = $${idx++}`);
    params.push(input.occurred_at);
  }
  if (input.event_type !== undefined) {
    sets.push(`event_type = $${idx++}`);
    params.push(input.event_type);
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    params.push(input.notes);
  }
  if (input.metadata !== undefined) {
    sets.push(`metadata = $${idx++}::jsonb`);
    params.push(JSON.stringify(input.metadata));
  }
  if (input.photos !== undefined) {
    sets.push(`photos = $${idx++}::jsonb`);
    params.push(JSON.stringify(input.photos));
  }
  if (sets.length === 0) return getBatch(batchId);
  params.push(batchId);
  const { rows } = await query<EventRow>(
    `UPDATE events SET ${sets.join(', ')} WHERE batch_id = $${idx}
     RETURNING ${SELECT_COLS}`,
    params
  );
  return rows.map(rowToRecord);
}

export async function deleteBatch(batchId: string): Promise<number> {
  const { rowCount } = await query('DELETE FROM events WHERE batch_id = $1', [batchId]);
  return rowCount ?? 0;
}
