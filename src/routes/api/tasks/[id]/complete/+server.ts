import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { completeTask } from '$lib/server/repositories/tasks';

/**
 * Mark the task done. If it recurs, a fresh task for the next occurrence is
 * inserted in the same transaction and returned alongside the completed one.
 */
export const POST: RequestHandler = async ({ params }) => {
  const { completed, next } = await completeTask(params.id);
  if (!completed) throw error(404, 'task_not_found_or_already_done');
  return json({ completed, next });
};
