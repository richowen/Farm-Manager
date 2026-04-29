-- Tasks & reminders. A task has an optional location link and optional
-- recurrence. When a recurring task is marked done, the server inserts
-- the next occurrence.

CREATE TABLE IF NOT EXISTS tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  notes       text,
  due_at      timestamptz NOT NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  done_at     timestamptz,
  recurrence  text NOT NULL DEFAULT 'none'
              CHECK (recurrence IN ('none', 'weekly', 'monthly', 'yearly')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_due_idx      ON tasks(due_at) WHERE done_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_location_idx ON tasks(location_id);

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
