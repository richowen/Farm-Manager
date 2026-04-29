import { query, withTransaction } from '../db';
import type {
  CreateLocationInput,
  FieldUseRecord,
  LineType,
  LocationKind,
  LocationRecord,
  UpdateLocationInput
} from '$lib/schemas';

/**
 * Shape returned by the Postgres queries — we ask PostGIS to serialise geometry
 * as GeoJSON with ST_AsGeoJSON, then parse it on the Node side.
 */
interface LocationRow {
  id: string;
  kind: LocationKind;
  name: string;
  color: string | null;
  notes: string | null;
  tags: string[] | null;
  line_type: LineType | null;
  geometry_json: string;
  area_ha: string | null; // numeric comes across as string
  length_m: string | null;
  created_at: Date;
  updated_at: Date;
  // Current-use join fields (nullable if no open period).
  cu_id: string | null;
  cu_use_type: string | null;
  cu_started_at: Date | null;
  cu_ended_at: Date | null;
  cu_notes: string | null;
  cu_metadata: Record<string, unknown> | null;
  cu_created_at: Date | null;
  cu_updated_at: Date | null;
}

function rowToRecord(row: LocationRow): LocationRecord {
  let currentUse: FieldUseRecord | null = null;
  if (row.cu_id) {
    currentUse = {
      id: row.cu_id,
      location_id: row.id,
      use_type: row.cu_use_type ?? '',
      started_at: (row.cu_started_at as Date).toISOString(),
      ended_at: row.cu_ended_at ? row.cu_ended_at.toISOString() : null,
      notes: row.cu_notes,
      metadata: row.cu_metadata ?? {},
      created_at: (row.cu_created_at as Date).toISOString(),
      updated_at: (row.cu_updated_at as Date).toISOString()
    };
  }
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    color: row.color,
    notes: row.notes,
    tags: row.tags ?? [],
    line_type: row.line_type,
    geometry: JSON.parse(row.geometry_json),
    area_ha: row.area_ha === null ? null : Number(row.area_ha),
    length_m: row.length_m === null ? null : Number(row.length_m),
    current_use: currentUse,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

const SELECT_COLS = `
  l.id, l.kind, l.name, l.color, l.notes, l.tags, l.line_type,
  ST_AsGeoJSON(l.geom)::text AS geometry_json,
  l.area_ha,
  CASE WHEN l.kind = 'line'
       THEN ST_Length(l.geom)
       ELSE NULL END AS length_m,
  l.created_at, l.updated_at,
  cu.id            AS cu_id,
  cu.use_type      AS cu_use_type,
  cu.started_at    AS cu_started_at,
  cu.ended_at      AS cu_ended_at,
  cu.notes         AS cu_notes,
  cu.metadata      AS cu_metadata,
  cu.created_at    AS cu_created_at,
  cu.updated_at    AS cu_updated_at
`;

const FROM_WITH_CURRENT_USE = `
  FROM locations l
  LEFT JOIN field_uses cu
    ON cu.location_id = l.id AND cu.ended_at IS NULL
`;

export async function listLocations(): Promise<LocationRecord[]> {
  const { rows } = await query<LocationRow>(
    `SELECT ${SELECT_COLS} ${FROM_WITH_CURRENT_USE} ORDER BY l.kind, l.name`
  );
  return rows.map(rowToRecord);
}

export async function getLocation(id: string): Promise<LocationRecord | null> {
  const { rows } = await query<LocationRow>(
    `SELECT ${SELECT_COLS} ${FROM_WITH_CURRENT_USE} WHERE l.id = $1`,
    [id]
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function getLocationsByIds(ids: string[]): Promise<LocationRecord[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<LocationRow>(
    `SELECT ${SELECT_COLS} ${FROM_WITH_CURRENT_USE} WHERE l.id = ANY($1::uuid[])`,
    [ids]
  );
  return rows.map(rowToRecord);
}

export async function createLocation(input: CreateLocationInput): Promise<LocationRecord> {
  const geomJson = JSON.stringify(input.geometry);
  // area_ha only applies to fields (Polygon / MultiPolygon). PostGIS
  // ST_Area(geography) returns square metres.
  const areaExpr =
    input.kind === 'field'
      ? 'ST_Area(ST_GeomFromGeoJSON($6)::geography) / 10000.0'
      : 'NULL';
  const lineType = input.kind === 'line' ? input.line_type ?? null : null;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO locations (kind, name, color, notes, tags, geom, area_ha, line_type)
     VALUES ($1, $2, $3, $4, $5::text[], ST_GeomFromGeoJSON($6)::geography, ${areaExpr}, $7)
     RETURNING id`,
    [
      input.kind,
      input.name,
      input.color ?? null,
      input.notes ?? null,
      input.tags ?? [],
      geomJson,
      lineType
    ]
  );
  const created = await getLocation(rows[0].id);
  if (!created) throw new Error('created location not found after insert');
  return created;
}

export async function updateLocation(
  id: string,
  input: UpdateLocationInput
): Promise<LocationRecord | null> {
  // Fetch the current row so we know the kind (needed for area recalc).
  const existing = await getLocation(id);
  if (!existing) return null;

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(input.name);
  }
  if (input.color !== undefined) {
    sets.push(`color = $${idx++}`);
    params.push(input.color);
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    params.push(input.notes);
  }
  if (input.tags !== undefined) {
    sets.push(`tags = $${idx++}::text[]`);
    params.push(input.tags);
  }
  if (input.line_type !== undefined) {
    sets.push(`line_type = $${idx++}`);
    params.push(input.line_type);
  }
  if (input.geometry !== undefined) {
    sets.push(`geom = ST_GeomFromGeoJSON($${idx})::geography`);
    if (existing.kind === 'field') {
      sets.push(`area_ha = ST_Area(ST_GeomFromGeoJSON($${idx})::geography) / 10000.0`);
    }
    params.push(JSON.stringify(input.geometry));
    idx++;
  }

  if (sets.length === 0) return existing;

  params.push(id);
  await query(
    `UPDATE locations SET ${sets.join(', ')} WHERE id = $${idx}`,
    params
  );
  return getLocation(id);
}

export async function deleteLocation(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM locations WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

// ---- Batch property updates -------------------------------------------------

export interface BatchPatch {
  color?: string | null;
  /** Which tag-merge strategy to apply when `tags` is set. */
  tagsMode?: 'replace' | 'add' | 'remove';
  tags?: string[];
  /** Pass `null` to clear, `'pipe'`/`'drain'` to set. Undefined leaves as-is. */
  line_type?: LineType | null;
}

export async function updateMany(
  ids: string[],
  patch: BatchPatch
): Promise<LocationRecord[]> {
  if (ids.length === 0) return [];

  await withTransaction(async (client) => {
    if (patch.color !== undefined) {
      await client.query(
        'UPDATE locations SET color = $1 WHERE id = ANY($2::uuid[])',
        [patch.color, ids]
      );
    }
    if (patch.line_type !== undefined) {
      // Only affects rows with kind='line'; the CHECK constraint will reject
      // attempts on other kinds, so scope the UPDATE defensively.
      await client.query(
        `UPDATE locations SET line_type = $1
          WHERE id = ANY($2::uuid[]) AND kind = 'line'`,
        [patch.line_type, ids]
      );
    }
    if (patch.tags !== undefined) {
      const mode = patch.tagsMode ?? 'replace';
      if (mode === 'replace') {
        await client.query(
          'UPDATE locations SET tags = $1::text[] WHERE id = ANY($2::uuid[])',
          [patch.tags, ids]
        );
      } else if (mode === 'add') {
        // Union-then-uniq existing tags with new ones.
        await client.query(
          `UPDATE locations
              SET tags = ARRAY(
                SELECT DISTINCT t FROM unnest(tags || $1::text[]) AS t
              )
            WHERE id = ANY($2::uuid[])`,
          [patch.tags, ids]
        );
      } else if (mode === 'remove') {
        await client.query(
          `UPDATE locations
              SET tags = ARRAY(
                SELECT t FROM unnest(tags) AS t WHERE t <> ALL($1::text[])
              )
            WHERE id = ANY($2::uuid[])`,
          [patch.tags, ids]
        );
      }
    }
  });

  return getLocationsByIds(ids);
}
