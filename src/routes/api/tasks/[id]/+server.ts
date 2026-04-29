import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateTaskSchema } from '$lib/schemas';
import { deleteTask, getTask, updateTask } from '$lib/server/repositories/tasks';

export const GET: RequestHandler = async ({ params }) => {
  const t = await getTask(params.id);
  if (!t) throw error(404, 'task_not_found');
  return json(t);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const updated = await updateTask(params.id, parsed.data);
  if (!updated) throw error(404, 'task_not_found');
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
  const ok = await deleteTask(params.id);
  if (!ok) throw error(404, 'task_not_found');
  return json({ ok: true });
};
