import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEvent, listEvents } from '$lib/server/repositories/events';
import { getLocation } from '$lib/server/repositories/locations';
import { createEventSchema, eventTypeSchema, type EventType } from '$lib/schemas';

function parseTypes(raw: string | null): EventType[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: EventType[] = [];
  for (const p of parts) {
    const parsed = eventTypeSchema.safeParse(p);
    if (parsed.success) out.push(parsed.data);
  }
  return out.length > 0 ? out : undefined;
}

export const GET: RequestHandler = async ({ params, url }) => {
  const location = await getLocation(params.id);
  if (!location) throw error(404, 'location_not_found');

  const types = parseTypes(url.searchParams.get('type'));
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 50, 1), 200) : 50;

  const result = await listEvents({ locationId: params.id, types, from, to, cursor, limit });
  return json(result);
};

export const POST: RequestHandler = async ({ params, request }) => {
  const location = await getLocation(params.id);
  if (!location) throw error(404, 'location_not_found');

  const body = await request.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const created = await createEvent(params.id, parsed.data);
  return json(created, { status: 201 });
};
