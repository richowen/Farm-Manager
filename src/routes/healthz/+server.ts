import type { RequestHandler } from './$types';
import { ping } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  const dbOk = await ping();
  const body = { status: dbOk ? 'ok' : 'degraded', db: dbOk };
  return new Response(JSON.stringify(body), {
    status: dbOk ? 200 : 503,
    headers: { 'content-type': 'application/json' }
  });
};

// This is the healthcheck — never require auth, never cache.
export const prerender = false;
