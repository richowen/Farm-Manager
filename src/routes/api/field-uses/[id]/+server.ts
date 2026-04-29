import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteUse, getById, updateUse } from '$lib/server/repositories/fieldUses';
import { updateFieldUseSchema } from '$lib/schemas';

export const GET: RequestHandler = async ({ params }) => {
  const row = await getById(params.id);
  if (!row) throw error(404, 'field_use_not_found');
  return json(row);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => null);
  const parsed = updateFieldUseSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, { message: 'invalid_body: ' + parsed.error.message });
  }
  const updated = await updateUse(params.id, parsed.data);
  if (!updated) throw error(404, 'field_use_not_found');
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
  const ok = await deleteUse(params.id);
  if (!ok) throw error(404, 'field_use_not_found');
  return json({ ok: true });
};
