import type { RequestHandler } from './$types';
import { clearSessionCookie } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ cookies }) => {
  clearSessionCookie(cookies);
  return json({ ok: true });
};
