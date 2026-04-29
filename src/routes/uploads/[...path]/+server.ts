import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'node:fs/promises';
import { mimeFor, resolveStoredPath } from '$lib/server/uploads';

/**
 * Serve a stored photo by its `YYYY/MM/uuid.jpg` path. Auth-gated by the
 * normal session middleware (hooks.server.ts); no cookie → 401.
 *
 * We read the whole file into memory rather than streaming it because:
 *   - The upload pipeline caps long-edge at 2000 px and re-encodes JPEG q85,
 *     so the stored files are realistically <1 MB each.
 *   - Bridging a Node `fs.ReadStream` into SvelteKit's `Response` body in an
 *     adapter-agnostic way is awkward (`Readable.toWeb` works on Node 18+
 *     but is flagged experimental); a plain Buffer is trivially portable.
 */
export const GET: RequestHandler = async ({ params }) => {
  const relPath = params.path ?? '';
  const resolved = await resolveStoredPath(relPath);
  if (!resolved) throw error(404, 'photo_not_found');

  const body = await readFile(resolved.fullPath);
  return new Response(body, {
    headers: {
      'content-type': mimeFor(relPath),
      'content-length': String(body.byteLength),
      // Photos are immutable (filenames are uuids) — cache forever in the
      // browser. The service worker explicitly skips this path.
      'cache-control': 'private, max-age=31536000, immutable'
    }
  });
};
