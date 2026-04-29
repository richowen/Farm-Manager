import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveUpload, validateUpload } from '$lib/server/uploads';
import { logger } from '$lib/server/logger';

/**
 * Accepts a single image file under form field `file`. Returns the stored
 * PhotoRef so the client can attach it to an event payload.
 */
export const POST: RequestHandler = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw error(400, 'invalid_multipart');
  }
  const f = form.get('file');
  if (!(f instanceof File)) throw error(400, 'missing_file');

  const check = validateUpload(f);
  if (!check.ok) throw error(400, check.reason);

  try {
    const ref = await saveUpload(f);
    return json(ref, { status: 201 });
  } catch (err) {
    logger.error({ err }, 'upload failed');
    if (err instanceof Error) {
      if (err.message === 'image_processing_unavailable') {
        throw error(503, 'image_processing_unavailable');
      }
      // invalid_image covers "file the client sent claims to be image/jpeg
      // but sharp can't decode it" — a client error, not a server error.
      if (err.message === 'invalid_image') throw error(400, 'invalid_image');
    }
    throw error(500, 'upload_failed');
  }
};
