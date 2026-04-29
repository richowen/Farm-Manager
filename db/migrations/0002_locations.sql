-- Unified locations table: kind = 'field' | 'shed'.
-- Fields store a Polygon/MultiPolygon geography, sheds store a Point geography.
CREATE TABLE IF NOT EXISTS locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('field', 'shed')),
  name        text NOT NULL,
  color       text,
  notes       text,
  geom        geography(Geometry, 4326) NOT NULL,
  area_ha     numeric,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Spatial index — GIST works on geography(Geometry) column directly.
CREATE INDEX IF NOT EXISTS locations_geom_gix ON locations USING GIST (geom);
CREATE INDEX IF NOT EXISTS locations_kind_idx ON locations (kind);

-- Keep updated_at honest.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS locations_updated_at ON locations;
CREATE TRIGGER locations_updated_at
BEFORE UPDATE ON locations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
