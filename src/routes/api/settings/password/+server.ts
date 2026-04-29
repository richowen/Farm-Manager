import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { changePasswordSchema } from '$lib/schemas';
import {
  hashPassword,
  verifyPassword
} from '$lib/server/auth';
import { setPasswordHashOverride } from '$lib/server/repositories/settings';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) throw error(400, 'invalid_body');
  const ok = await verifyPassword(parsed.data.current);
  if (!ok) throw error(401, 'wrong_password');
  const hash = await hashPassword(parsed.data.next);
  await setPasswordHashOverride(hash);
  return json({ ok: true });
};
