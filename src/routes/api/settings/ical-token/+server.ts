import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearIcalToken, generateIcalToken } from '$lib/server/repositories/settings';

/**
 * POST → (re)generate a feed token. Invalidates any previous URL.
 * DELETE → disable the feed entirely (the URL stops working).
 */
export const POST: RequestHandler = async () => {
  const token = await generateIcalToken();
  return json({ token });
};

export const DELETE: RequestHandler = async () => {
  await clearIcalToken();
  return json({ ok: true });
};
