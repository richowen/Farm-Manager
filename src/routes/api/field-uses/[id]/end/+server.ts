import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endFieldUseSchema } from '$lib/schemas';
import { endUse, getById } from '$lib/server/repositories/fieldUses';

/**
 * Close the open use period for the location this use belongs to. Body:
 *   { ended_at?: ISO8601 }   // default = now()
 *
 * We key off location_id so calling /end twice is idempotent (the second call
 * is a no-op) and so ending works even if the caller has the id of an already
 * closed row from the history list.
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const existing = await getById(params.id);
  if (!existing) throw error(404, 'field_use_not_found');

  const bodyRaw = await request.json().catch(() => ({}));
  const parsed = endFieldUseSchema.safeParse(bodyRaw ?? {});
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const ended = await endUse(existing.location_id, parsed.data.ended_at);
  return json(ended ?? { ok: true });
};
