import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listEvents, createEvent } from '$lib/server/repositories/events';
import { createEventSchema, eventTypeSchema, type EventType } from '$lib/schemas';

/**
 * Collection endpoint for events:
 *   GET  /api/events?batch_id=…   — list a batch (flat, no paging)
 *   POST /api/events              — create a STANDALONE event (location_id=null)
 *                                   for "I am here" GPS quick-logs outside
 *                                   any field. Coordinates should be in
 *                                   metadata.coords = [lng, lat].
 */
export const GET: RequestHandler = async ({ url }) => {
  const batchId = url.searchParams.get('batch_id');
  if (batchId) {
    if (!/^[0-9a-f-]{36}$/i.test(batchId)) throw error(400, 'invalid_batch_id');
    const res = await listEvents({ batchId, limit: 200 });
    return json({ items: res.items });
  }

  const typeRaw = url.searchParams.get('type');
  const types: EventType[] | undefined = typeRaw
    ? (typeRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const p = eventTypeSchema.safeParse(s);
          return p.success ? p.data : null;
        })
        .filter((t): t is EventType => t !== null) as EventType[])
    : undefined;
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 50, 1), 200) : 50;
  const res = await listEvents({ types, from, to, cursor, limit });
  return json(res);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  // Standalone — location_id intentionally null.
  const created = await createEvent(null, parsed.data);
  return json(created, { status: 201 });
};
