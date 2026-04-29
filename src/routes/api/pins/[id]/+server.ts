import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updatePinSchema } from '$lib/schemas';
import { deletePin, getPin, updatePin } from '$lib/server/repositories/pins';

export const GET: RequestHandler = async ({ params }) => {
  const p = await getPin(params.id);
  if (!p) throw error(404, 'pin_not_found');
  return json(p);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => null);
  const parsed = updatePinSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const updated = await updatePin(params.id, parsed.data);
  if (!updated) throw error(404, 'pin_not_found');
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
  const ok = await deletePin(params.id);
  if (!ok) throw error(404, 'pin_not_found');
  return json({ ok: true });
};
