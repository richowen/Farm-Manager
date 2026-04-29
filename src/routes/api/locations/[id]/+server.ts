import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  deleteLocation,
  getLocation,
  updateLocation
} from '$lib/server/repositories/locations';
import { updateLocationSchema } from '$lib/schemas';

export const GET: RequestHandler = async ({ params }) => {
  const loc = await getLocation(params.id);
  if (!loc) throw error(404, 'location_not_found');
  return json(loc);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => null);
  const parsed = updateLocationSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const updated = await updateLocation(params.id, parsed.data);
  if (!updated) throw error(404, 'location_not_found');
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
  const ok = await deleteLocation(params.id);
  if (!ok) throw error(404, 'location_not_found');
  return json({ ok: true });
};
