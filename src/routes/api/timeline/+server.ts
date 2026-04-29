import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listEvents } from '$lib/server/repositories/events';
import { eventTypeSchema, type EventType } from '$lib/schemas';

export const GET: RequestHandler = async ({ url }) => {
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
  const location = url.searchParams.get('location') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 50, 1), 200) : 50;

  if (location && !/^[0-9a-f-]{36}$/i.test(location)) {
    throw error(400, 'invalid_location');
  }

  const result = await listEvents({
    types,
    from,
    to,
    locationId: location,
    cursor,
    limit
  });
  return json(result);
};
