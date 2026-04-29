-- Split 'line' locations into pipes and drains.
-- Legacy v0.2.0 rows keep line_type = NULL and render with generic styling.
-- The geom column already accepts MultiLineString, so no geometry migration
-- is needed; ST_Length handles both single and multi lines.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS line_type text;

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_line_type_check;
ALTER TABLE locations ADD CONSTRAINT locations_line_type_check
  CHECK (
    line_type IS NULL
    OR (kind = 'line' AND line_type IN ('pipe', 'drain'))
  );

CREATE INDEX IF NOT EXISTS locations_line_type_idx
  ON locations (line_type)
  WHERE line_type IS NOT NULL;
