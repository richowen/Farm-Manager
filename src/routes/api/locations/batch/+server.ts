import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { batchLocationPatchSchema } from '$lib/schemas';
import { getLocationsByIds, updateMany } from '$lib/server/repositories/locations';
import { startUseMany } from '$lib/server/repositories/fieldUses';

/**
 * Batch patch: property updates (color, tags) and/or a new field-use period
 * applied to every id in a single transaction per concern.
 */
export const PATCH: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const parsed = batchLocationPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }

  const { ids, patch, use } = parsed.data;

  if (patch && (patch.tags !== undefined || patch.color !== undefined)) {
    await updateMany(ids, {
      color: patch.color ?? undefined,
      tags: patch.tags,
      tagsMode: patch.tagsMode
    });
  }
  if (use) {
    await startUseMany(ids, use);
  }

  const items = await getLocationsByIds(ids);
  return json({ items });
};
