import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { batchEventInputSchema } from '$lib/schemas';
import { createBatch } from '$lib/server/repositories/events';

/**
 * Create one event per selected location, all sharing a single `batch_id`.
 * Returns { batch_id, items } so the client can offer a 10-second undo by
 * calling DELETE /api/events/batch/:batch_id.
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const parsed = batchEventInputSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const { location_ids, event } = parsed.data;
  const { batchId, events } = await createBatch(location_ids, event);
  return json({ batch_id: batchId, items: events }, { status: 201 });
};
