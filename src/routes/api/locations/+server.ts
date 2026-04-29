import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLocation, listLocations } from '$lib/server/repositories/locations';
import { createLocationSchema } from '$lib/schemas';

export const GET: RequestHandler = async () => {
  const items = await listLocations();
  return json({ items });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const parsed = createLocationSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const created = await createLocation(parsed.data);
  return json(created, { status: 201 });
};
