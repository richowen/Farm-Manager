import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { batchEventUpdateSchema } from '$lib/schemas';
import {
  deleteBatch,
  getBatch,
  updateBatch
} from '$lib/server/repositories/events';

export const GET: RequestHandler = async ({ params }) => {
  const items = await getBatch(params.batchId);
  if (items.length === 0) throw error(404, 'batch_not_found');
  return json({ items });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => null);
  const parsed = batchEventUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const items = await updateBatch(params.batchId, parsed.data);
  if (items.length === 0) throw error(404, 'batch_not_found');
  return json({ items });
};

/**
 * Delete the whole batch. Idempotent — returns 204 even if already gone, so
 * double-click / retry on the undo toast doesn't error.
 */
export const DELETE: RequestHandler = async ({ params }) => {
  await deleteBatch(params.batchId);
  return new Response(null, { status: 204 });
};
