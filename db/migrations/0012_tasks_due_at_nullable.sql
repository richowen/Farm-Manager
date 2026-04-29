-- v0.5.0: make tasks.due_at nullable so Calendar entries can be "undated".
-- Undated entries have no DTSTART in the iCal feed and are displayed
-- without a date in the UI.
ALTER TABLE tasks ALTER COLUMN due_at DROP NOT NULL;
