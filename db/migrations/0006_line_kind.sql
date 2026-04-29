-- Allow 'line' as a location kind (for pipes, drains, tracks, fences).
-- The geom column is already GEOMETRY(Geometry, 4326) so LineString fits
-- without any column change.

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_kind_check;
ALTER TABLE locations ADD CONSTRAINT locations_kind_check
  CHECK (kind IN ('field', 'shed', 'line'));
