-- Events: batch grouping, photo attachments, and allow standalone events
-- (no location) for "I am here" GPS quick-logs outside any field.

ALTER TABLE events ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE events ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;
-- photos = [{ path: "2026/04/abc.jpg", w: 1920, h: 1080, size: 348120 }, ...]

-- Make location_id nullable so "I am here outside any field" can record an
-- event with only GPS coordinates stored in metadata.
ALTER TABLE events ALTER COLUMN location_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS events_batch_idx ON events(batch_id) WHERE batch_id IS NOT NULL;
