import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSettings, updateSettings } from '$lib/server/repositories/settings';
import { updateSettingsSchema } from '$lib/schemas';

export const GET: RequestHandler = async () => {
  return json(await getSettings());
};

export const PATCH: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const updated = await updateSettings(parsed.data);
  return json(updated);
};
