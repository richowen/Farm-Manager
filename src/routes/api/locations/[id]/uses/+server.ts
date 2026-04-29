import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLocation } from '$lib/server/repositories/locations';
import { listByLocation, startUse } from '$lib/server/repositories/fieldUses';
import { fieldUseInputSchema } from '$lib/schemas';

export const GET: RequestHandler = async ({ params }) => {
  const loc = await getLocation(params.id);
  if (!loc) throw error(404, 'location_not_found');
  const items = await listByLocation(params.id);
  return json({ items });
};

export const POST: RequestHandler = async ({ params, request }) => {
  const loc = await getLocation(params.id);
  if (!loc) throw error(404, 'location_not_found');
  const body = await request.json().catch(() => null);
  const parsed = fieldUseInputSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const created = await startUse(params.id, parsed.data);
  return json(created, { status: 201 });
};
