import { query } from '../db';
import type {
  CreateLocationInput,
  LocationRecord,
  UpdateLocationInput
} from '$lib/schemas';

/**
 * Shape returned by the Postgres queries — we ask PostGIS to serialise geometry
 * as GeoJSON with ST_AsGeoJSON, then parse it on the Node side.
 */
interface LocationRow {
  id: string;
  kind: 'field' | 'shed';
  name: string;
  color: string | null;
  notes: string | null;
  geometry_json: string;
  area_ha: string | null; // numeric comes across as string
  created_at: Date;
  updated_at: Date;
}

function rowToRecord(row: LocationRow): LocationRecord {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    color: row.color,
    notes: row.notes,
    geometry: JSON.parse(row.geometry_json),
    area_ha: row.area_ha === null ? null : Number(row.area_ha),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

const SELECT_COLS = `
  id, kind, name, color, notes,
  ST_AsGeoJSON(geom)::text AS geometry_json,
  area_ha, created_at, updated_at
`;

export async function listLocations(): Promise<LocationRecord[]> {
  const { rows } = await query<LocationRow>(
    `SELECT ${SELECT_COLS} FROM locations ORDER BY kind, name`
  );
  return rows.map(rowToRecord);
}

export async function getLocation(id: string): Promise<LocationRecord | null> {
  const { rows } = await query<LocationRow>(
    `SELECT ${SELECT_COLS} FROM locations WHERE id = $1`,
    [id]
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function createLocation(input: CreateLocationInput): Promise<LocationRecord> {
  const geomJson = JSON.stringify(input.geometry);
  // area_ha only applies to fields (Polygon / MultiPolygon). PostGIS
  // ST_Area(geography) returns square metres.
  const areaExpr =
    input.kind === 'field'
      ? 'ST_Area(ST_GeomFromGeoJSON($5)::geography) / 10000.0'
      : 'NULL';
  const { rows } = await query<LocationRow>(
    `INSERT INTO locations (kind, name, color, notes, geom, area_ha)
     VALUES ($1, $2, $3, $4, ST_GeomFromGeoJSON($5)::geography, ${areaExpr})
     RETURNING ${SELECT_COLS}`,
    [input.kind, input.name, input.color ?? null, input.notes ?? null, geomJson]
  );
  return rowToRecord(rows[0]);
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
  const { rows } = await query<LocationRow>(
    `UPDATE locations SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING ${SELECT_COLS}`,
    params
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function deleteLocation(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM locations WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
