-- Field use tracking + ad-hoc tags on locations.
--
-- Tags are a flat text array so the user can throw `#wheat2026` / `#ewes`
-- on a field without upfront schema. `field_uses` is a history table so
-- you can look back at what a field was doing over time.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS locations_tags_idx ON locations USING GIN (tags);

CREATE TABLE IF NOT EXISTS field_uses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  use_type    text NOT NULL,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz,
  notes       text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Only one "currently open" period per location.
CREATE UNIQUE INDEX IF NOT EXISTS field_uses_current_idx
  ON field_uses(location_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS field_uses_location_started_idx
  ON field_uses(location_id, started_at DESC);

DROP TRIGGER IF EXISTS field_uses_updated_at ON field_uses;
CREATE TRIGGER field_uses_updated_at
BEFORE UPDATE ON field_uses
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
