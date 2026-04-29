-- Pins: spatially-anchored notes with 3-state status (todo/done/note), a
-- user-configurable category, optional title + notes, and photos. Pins are
-- independent of fields/sheds/lines — deleting a field sets the snapshot
-- location_id to NULL rather than cascading.

CREATE TABLE IF NOT EXISTS pins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  uuid REFERENCES locations(id) ON DELETE SET NULL,
  geom         geography(Point, 4326) NOT NULL,
  title        text,
  notes        text,
  category     text,
  status       text NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo', 'done', 'note')),
  photos       jsonb NOT NULL DEFAULT '[]'::jsonb,
  accuracy_m   numeric,
  done_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pins_geom_gix     ON pins USING GIST (geom);
CREATE INDEX IF NOT EXISTS pins_status_idx   ON pins (status);
CREATE INDEX IF NOT EXISTS pins_category_idx ON pins (category);
CREATE INDEX IF NOT EXISTS pins_created_idx  ON pins (created_at DESC);
CREATE INDEX IF NOT EXISTS pins_location_idx ON pins (location_id) WHERE location_id IS NOT NULL;

DROP TRIGGER IF EXISTS pins_updated_at ON pins;
CREATE TRIGGER pins_updated_at
BEFORE UPDATE ON pins
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
