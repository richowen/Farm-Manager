-- Single-row settings store. Use a fixed PK and UPSERT.
CREATE TABLE IF NOT EXISTS settings (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  password_hash text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (id, data) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS settings_updated_at ON settings;
CREATE TRIGGER settings_updated_at
BEFORE UPDATE ON settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
