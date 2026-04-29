import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTaskSchema } from '$lib/schemas';
import {
  counts,
  createTask,
  listTasks,
  type TaskFilter
} from '$lib/server/repositories/tasks';

const VALID_FILTERS = new Set<TaskFilter>(['open', 'due', 'overdue', 'done', 'all']);

export const GET: RequestHandler = async ({ url }) => {
  const filterRaw = url.searchParams.get('filter') ?? 'all';
  const filter = (VALID_FILTERS.has(filterRaw as TaskFilter) ? filterRaw : 'all') as TaskFilter;
  const items = await listTasks(filter);
  if (url.searchParams.get('counts') === '1') {
    const c = await counts();
    return json({ items, counts: c });
  }
  return json({ items });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const created = await createTask(parsed.data);
  return json(created, { status: 201 });
};
