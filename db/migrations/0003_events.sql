CREATE TABLE IF NOT EXISTS events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL,
  event_type    text NOT NULL,
  notes         text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_location_occurred_idx
  ON events (location_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS events_occurred_idx
  ON events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS events_type_idx
  ON events (event_type);

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
