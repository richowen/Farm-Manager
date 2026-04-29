import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listForFeed } from '$lib/server/repositories/tasks';
import { listLocations } from '$lib/server/repositories/locations';
import { verifyIcalToken } from '$lib/server/repositories/settings';
import { tasksToIcs, type TaskWithLocation } from '$lib/server/ical';
import { env } from '$lib/server/env';

/**
 * Public iCal feed. Authenticated by the `?token=` query-string parameter —
 * this route is explicitly allowed through the session guard so that Google
 * Calendar, Apple Calendar, and friends can poll without cookies.
 *
 * Response is cached privately for 5 minutes so Google's own poll cadence
 * (hours, not minutes) doesn't hammer us, while still feeling fresh if the
 * user refreshes the URL in the browser.
 */
export const GET: RequestHandler = async ({ url }) => {
  const token = url.searchParams.get('token');
  const ok = await verifyIcalToken(token);
  if (!ok) throw error(401, 'invalid_token');

  const tasks = await listForFeed();
  if (tasks.length === 0) {
    return new Response(tasksToIcs([], env().ORIGIN), {
      headers: icsHeaders()
    });
  }

  const locations = await listLocations();
  const byId = new Map(locations.map((l) => [l.id, l]));

  const decorated: TaskWithLocation[] = tasks.map((t) => {
    const loc = t.location_id ? byId.get(t.location_id) : null;
    return {
      ...t,
      location_name: loc?.name ?? null,
      location_centroid: loc ? centroidOf(loc.geometry) : null
    };
  });

  return new Response(tasksToIcs(decorated, env().ORIGIN), {
    headers: icsHeaders()
  });
};

function icsHeaders(): HeadersInit {
  return {
    'content-type': 'text/calendar; charset=utf-8',
    'cache-control': 'private, max-age=300',
    // Never let a generic CDN or the service worker cache this.
    'x-robots-tag': 'noindex'
  };
}

// Very rough bounding-box centroid — good enough for a calendar hint.
function centroidOf(geometry: unknown): { lat: number; lng: number } | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const g = geometry as { type?: string; coordinates?: unknown };
  if (g.type === 'Point' && Array.isArray(g.coordinates)) {
    const [lng, lat] = g.coordinates as number[];
    if (typeof lng === 'number' && typeof lat === 'number') return { lat, lng };
    return null;
  }
  const flat: [number, number][] = [];
  const walk = (v: unknown): void => {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === 'number' && typeof v[1] === 'number') {
      flat.push([v[0] as number, v[1] as number]);
    } else {
      for (const c of v) walk(c);
    }
  };
  walk(g.coordinates);
  if (flat.length === 0) return null;
  const sum = flat.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 }
  );
  return { lat: sum.lat / flat.length, lng: sum.lng / flat.length };
}
