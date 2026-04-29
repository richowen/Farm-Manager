import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPinSchema, pinStatusSchema } from '$lib/schemas';
import { createPin, listPins, statusCounts } from '$lib/server/repositories/pins';

export const GET: RequestHandler = async ({ url }) => {
  const filter: Parameters<typeof listPins>[0] = {};
  const statusRaw = url.searchParams.get('status');
  if (statusRaw) {
    const parsed = pinStatusSchema.safeParse(statusRaw);
    if (parsed.success) filter.status = parsed.data;
  }
  const category = url.searchParams.get('category');
  if (category) filter.category = category;
  const location = url.searchParams.get('location');
  if (location) filter.location_id = location;

  const items = await listPins(filter);
  if (url.searchParams.get('counts') === '1') {
    const counts = await statusCounts();
    return json({ items, counts });
  }
  return json({ items });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const parsed = createPinSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const created = await createPin(parsed.data);
  return json(created, { status: 201 });
};
