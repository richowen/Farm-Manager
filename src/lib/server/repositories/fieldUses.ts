import { query, withTransaction } from '../db';
import type {
  FieldUseInput,
  FieldUseRecord,
  UpdateFieldUseInput
} from '$lib/schemas';

interface FieldUseRow {
  id: string;
  location_id: string;
  use_type: string;
  started_at: Date;
  ended_at: Date | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function rowToRecord(row: FieldUseRow): FieldUseRecord {
  return {
    id: row.id,
    location_id: row.location_id,
    use_type: row.use_type,
    started_at: row.started_at.toISOString(),
    ended_at: row.ended_at ? row.ended_at.toISOString() : null,
    notes: row.notes,
    metadata: row.metadata ?? {},
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

const COLS =
  'id, location_id, use_type, started_at, ended_at, notes, metadata, created_at, updated_at';

export async function listByLocation(locationId: string): Promise<FieldUseRecord[]> {
  const { rows } = await query<FieldUseRow>(
    `SELECT ${COLS} FROM field_uses WHERE location_id = $1
       ORDER BY started_at DESC, created_at DESC`,
    [locationId]
  );
  return rows.map(rowToRecord);
}

export async function getById(id: string): Promise<FieldUseRecord | null> {
  const { rows } = await query<FieldUseRow>(
    `SELECT ${COLS} FROM field_uses WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function getCurrent(locationId: string): Promise<FieldUseRecord | null> {
  const { rows } = await query<FieldUseRow>(
    `SELECT ${COLS} FROM field_uses
      WHERE location_id = $1 AND ended_at IS NULL
      LIMIT 1`,
    [locationId]
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

/**
 * Start a new use period on a location. If there's an open period it's
 * auto-closed with ended_at = the new period's started_at. Runs in a single
 * transaction so the unique-open index is never violated.
 */
export async function startUse(
  locationId: string,
  input: FieldUseInput
): Promise<FieldUseRecord> {
  const startedAt = input.started_at ?? new Date().toISOString();
  return withTransaction(async (client) => {
    // Close any open period first.
    await client.query(
      `UPDATE field_uses SET ended_at = $1
        WHERE location_id = $2 AND ended_at IS NULL`,
      [startedAt, locationId]
    );
    const { rows } = await client.query<FieldUseRow>(
      `INSERT INTO field_uses (location_id, use_type, started_at, notes, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING ${COLS}`,
      [
        locationId,
        input.use_type,
        startedAt,
        input.notes ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
    return rowToRecord(rows[0]);
  });
}

export async function endUse(
  locationId: string,
  endedAt?: string
): Promise<FieldUseRecord | null> {
  const when = endedAt ?? new Date().toISOString();
  const { rows } = await query<FieldUseRow>(
    `UPDATE field_uses SET ended_at = $1
       WHERE location_id = $2 AND ended_at IS NULL
       RETURNING ${COLS}`,
    [when, locationId]
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function updateUse(
  id: string,
  input: UpdateFieldUseInput
): Promise<FieldUseRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (input.use_type !== undefined) {
    sets.push(`use_type = $${idx++}`);
    params.push(input.use_type);
  }
  if (input.started_at !== undefined) {
    sets.push(`started_at = $${idx++}`);
    params.push(input.started_at);
  }
  if (input.ended_at !== undefined) {
    sets.push(`ended_at = $${idx++}`);
    params.push(input.ended_at);
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    params.push(input.notes);
  }
  if (input.metadata !== undefined) {
    sets.push(`metadata = $${idx++}::jsonb`);
    params.push(JSON.stringify(input.metadata));
  }
  if (sets.length === 0) return getById(id);
  params.push(id);
  const { rows } = await query<FieldUseRow>(
    `UPDATE field_uses SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING ${COLS}`,
    params
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function deleteUse(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM field_uses WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

/**
 * Batch-start the same new use on many locations atomically. For each id,
 * closes the currently-open row (if any) with ended_at = startedAt and inserts
 * a fresh open row. Returns the list of newly-created rows (one per id).
 */
export async function startUseMany(
  locationIds: string[],
  input: FieldUseInput
): Promise<FieldUseRecord[]> {
  if (locationIds.length === 0) return [];
  const startedAt = input.started_at ?? new Date().toISOString();
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE field_uses SET ended_at = $1
        WHERE location_id = ANY($2::uuid[]) AND ended_at IS NULL`,
      [startedAt, locationIds]
    );
    // Insert one row per location id using a VALUES expansion.
    const values: string[] = [];
    const params: unknown[] = [
      input.use_type,
      startedAt,
      input.notes ?? null,
      JSON.stringify(input.metadata ?? {})
    ];
    locationIds.forEach((lid, i) => {
      const ordinal = 5 + i;
      values.push(`($${ordinal}, $1, $2, $3, $4::jsonb)`);
      params.push(lid);
    });
    const { rows } = await client.query<FieldUseRow>(
      `INSERT INTO field_uses (location_id, use_type, started_at, notes, metadata)
       VALUES ${values.join(', ')}
       RETURNING ${COLS}`,
      params
    );
    return rows.map(rowToRecord);
  });
}

/** True if any historical rows reference the given use_type. */
export async function useTypeInUse(useType: string): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    'SELECT count(*)::text AS n FROM field_uses WHERE use_type = $1',
    [useType]
  );
  return Number(rows[0]?.n ?? '0') > 0;
}
