import { query, withTransaction } from '../db';
import type { CreateTaskInput, Recurrence, TaskRecord, UpdateTaskInput } from '$lib/schemas';

interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  due_at: Date | null;
  location_id: string | null;
  done_at: Date | null;
  recurrence: Recurrence;
  created_at: Date;
  updated_at: Date;
}

function rowToRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    due_at: row.due_at ? row.due_at.toISOString() : null,
    location_id: row.location_id,
    done_at: row.done_at ? row.done_at.toISOString() : null,
    recurrence: row.recurrence,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

const COLS =
  'id, title, notes, due_at, location_id, done_at, recurrence, created_at, updated_at';

export type TaskFilter = 'open' | 'due' | 'overdue' | 'done' | 'all';

export async function listTasks(filter: TaskFilter = 'all'): Promise<TaskRecord[]> {
  const where: string[] = [];
  if (filter === 'open') where.push('done_at IS NULL');
  else if (filter === 'done') where.push('done_at IS NOT NULL');
  else if (filter === 'due') {
    where.push('done_at IS NULL');
    where.push(`due_at::date = now()::date`);
  } else if (filter === 'overdue') {
    where.push('done_at IS NULL');
    where.push('due_at < now()');
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query<TaskRow>(
    `SELECT ${COLS} FROM tasks ${whereSql}
       ORDER BY done_at IS NOT NULL, due_at ASC NULLS LAST, created_at ASC`
  );
  return rows.map(rowToRecord);
}

export async function getTask(id: string): Promise<TaskRecord | null> {
  const { rows } = await query<TaskRow>(`SELECT ${COLS} FROM tasks WHERE id = $1`, [id]);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRecord> {
  const { rows } = await query<TaskRow>(
    `INSERT INTO tasks (title, notes, due_at, location_id, recurrence)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLS}`,
    [
      input.title,
      input.notes ?? null,
      input.due_at,
      input.location_id ?? null,
      input.recurrence ?? 'none'
    ]
  );
  return rowToRecord(rows[0]);
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput
): Promise<TaskRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (input.title !== undefined) {
    sets.push(`title = $${idx++}`);
    params.push(input.title);
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    params.push(input.notes);
  }
  if (input.due_at !== undefined) {
    sets.push(`due_at = $${idx++}`);
    params.push(input.due_at);
  }
  if (input.location_id !== undefined) {
    sets.push(`location_id = $${idx++}`);
    params.push(input.location_id);
  }
  if (input.recurrence !== undefined) {
    sets.push(`recurrence = $${idx++}`);
    params.push(input.recurrence);
  }
  if (input.done_at !== undefined) {
    sets.push(`done_at = $${idx++}`);
    params.push(input.done_at);
  }
  if (sets.length === 0) return getTask(id);
  params.push(id);
  const { rows } = await query<TaskRow>(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING ${COLS}`,
    params
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function deleteTask(id: string): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM tasks WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

/**
 * Given the current due date and a recurrence, compute the next upcoming
 * due date. "Upcoming" means strictly in the future relative to `now`; if
 * the current task is already overdue (e.g. 3 weeks ago with weekly
 * recurrence), we advance by whole intervals until we pass `now`.
 *
 * Uses UTC arithmetic so advancing across daylight-saving transitions
 * doesn't shift the wall-clock time.
 */
export function nextOccurrence(due: Date, recurrence: Recurrence, now: Date = new Date()): Date | null {
  if (recurrence === 'none') return null;
  const next = new Date(due.getTime());
  const advance = (d: Date): void => {
    if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (recurrence === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  };
  advance(next);
  while (next.getTime() <= now.getTime()) advance(next);
  return next;
}

/**
 * Mark a task complete. If it recurs, also create the next open occurrence
 * (same title/notes/location/recurrence) and return it.
 */
export async function completeTask(
  id: string
): Promise<{ completed: TaskRecord | null; next: TaskRecord | null }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<TaskRow>(
      `UPDATE tasks SET done_at = now() WHERE id = $1 AND done_at IS NULL
       RETURNING ${COLS}`,
      [id]
    );
    const completed = rows[0] ? rowToRecord(rows[0]) : null;
    if (!completed) return { completed: null, next: null };
    if (completed.recurrence === 'none' || !completed.due_at) return { completed, next: null };
    const nextDue = nextOccurrence(new Date(completed.due_at), completed.recurrence);
    if (!nextDue) return { completed, next: null };
    const { rows: nxt } = await client.query<TaskRow>(
      `INSERT INTO tasks (title, notes, due_at, location_id, recurrence)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLS}`,
      [
        completed.title,
        completed.notes,
        nextDue.toISOString(),
        completed.location_id,
        completed.recurrence
      ]
    );
    return { completed, next: nxt[0] ? rowToRecord(nxt[0]) : null };
  });
}

export interface TaskCounts {
  overdue: number;
  dueToday: number;
  open: number;
}

export async function counts(): Promise<TaskCounts> {
  const { rows } = await query<{ overdue: string; due_today: string; open: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE done_at IS NULL AND due_at < now())::text AS overdue,
      COUNT(*) FILTER (WHERE done_at IS NULL AND due_at::date = now()::date)::text AS due_today,
      COUNT(*) FILTER (WHERE done_at IS NULL)::text AS open
    FROM tasks
  `);
  const r = rows[0];
  return {
    overdue: Number(r?.overdue ?? '0'),
    dueToday: Number(r?.due_today ?? '0'),
    open: Number(r?.open ?? '0')
  };
}

export async function listOpenByLocation(locationId: string): Promise<TaskRecord[]> {
  const { rows } = await query<TaskRow>(
    `SELECT ${COLS} FROM tasks
       WHERE location_id = $1 AND done_at IS NULL
       ORDER BY due_at ASC`,
    [locationId]
  );
  return rows.map(rowToRecord);
}

export async function listAllByLocation(locationId: string): Promise<TaskRecord[]> {
  const { rows } = await query<TaskRow>(
    `SELECT ${COLS} FROM tasks
       WHERE location_id = $1
       ORDER BY done_at IS NOT NULL, due_at ASC NULLS LAST, created_at ASC`,
    [locationId]
  );
  return rows.map(rowToRecord);
}

/** For the iCal feed: all open tasks + tasks completed in the last 30 days. */
export async function listForFeed(): Promise<TaskRecord[]> {
  const { rows } = await query<TaskRow>(
    `SELECT ${COLS} FROM tasks
       WHERE done_at IS NULL
          OR done_at > (now() - interval '30 days')
       ORDER BY due_at ASC`
  );
  return rows.map(rowToRecord);
}
