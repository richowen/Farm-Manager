import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteEvent, getEvent, updateEvent } from '$lib/server/repositories/events';
import { updateEventSchema } from '$lib/schemas';

export const GET: RequestHandler = async ({ params }) => {
  const ev = await getEvent(params.id);
  if (!ev) throw error(404, 'event_not_found');
  return json(ev);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => null);
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const updated = await updateEvent(params.id, parsed.data);
  if (!updated) throw error(404, 'event_not_found');
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
  const ok = await deleteEvent(params.id);
  if (!ok) throw error(404, 'event_not_found');
  return json({ ok: true });
};
