import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Readable } from 'node:stream';
import { createReadStream, readFile, mimeFor, resolveStoredPath } from '$lib/server/uploads';

/**
 * Serve a stored photo or video by its `YYYY/MM/uuid.ext` path.
 * Auth-gated by the normal session middleware (hooks.server.ts).
 *
 * Images: read into memory (~1 MB after sharp processing).
 * Videos: streamed with Range-request support so browsers can seek without
 *   downloading the whole file first. Uses Node 18+ `Readable.toWeb`.
 */
export const GET: RequestHandler = async ({ params, request }) => {
  const relPath = params.path ?? '';
  const resolved = await resolveStoredPath(relPath);
  if (!resolved) throw error(404, 'not_found');

  const mime = mimeFor(relPath);
  const cacheControl = 'private, max-age=31536000, immutable';

  if (mime.startsWith('video/')) {
    const total = resolved.size;
    const rangeHeader = request.headers.get('range');

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : total - 1;
      const chunkLen = end - start + 1;

      const nodeStream = createReadStream(resolved.fullPath, { start, end });
      const body = Readable.toWeb(nodeStream) as ReadableStream;

      return new Response(body, {
        status: 206,
        headers: {
          'content-type': mime,
          'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${total}`,
          'content-length': String(chunkLen),
          'cache-control': cacheControl
        }
      });
    }

    const nodeStream = createReadStream(resolved.fullPath);
    const body = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(body, {
      headers: {
        'content-type': mime,
        'accept-ranges': 'bytes',
        'content-length': String(total),
        'cache-control': cacheControl
      }
    });
  }

  // Images: read into memory (files are ~1 MB after sharp processing).
  const body = await readFile(resolved.fullPath);
  return new Response(body, {
    headers: {
      'content-type': mime,
      'content-length': String(body.byteLength),
      'cache-control': cacheControl
    }
  });
};
