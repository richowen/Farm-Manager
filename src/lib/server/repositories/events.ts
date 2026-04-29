import { query } from '../db';
import type { CreateEventInput, EventRecord, EventType, UpdateEventInput } from '$lib/schemas';

interface EventRow {
  id: string;
  location_id: string;
  occurred_at: Date;
  event_type: EventType;
  notes: string | null;
  metadata: Record<string, unknown>;
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
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

const SELECT_COLS =
  'id, location_id, occurred_at, event_type, notes, metadata, created_at, updated_at';

export interface ListEventsOptions {
  locationId?: string;
  types?: EventType[];
  from?: string;
  to?: string;
  limit?: number;
  // Cursor is `${occurred_at_iso}|${id}` (stable for keyset pagination).
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
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (c) {
      // Fetch records strictly older than the cursor (newest-first ordering).
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
  locationId: string,
  input: CreateEventInput
): Promise<EventRecord> {
  const { rows } = await query<EventRow>(
    `INSERT INTO events (location_id, occurred_at, event_type, notes, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING ${SELECT_COLS}`,
    [
      locationId,
      input.occurred_at,
      input.event_type,
      input.notes ?? null,
      JSON.stringify(input.metadata ?? {})
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
