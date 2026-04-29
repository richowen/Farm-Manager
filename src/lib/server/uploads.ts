import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from './env';
import { logger } from './logger';
import type { PhotoRef } from '$lib/schemas';

/**
 * Photo storage.
 *
 * Images are written to `${UPLOAD_DIR}/YYYY/MM/<uuid>.jpg`. We run them
 * through `sharp` to strip EXIF (keeping orientation), auto-rotate, and
 * downscale anything with a long edge >2000 px. On failure (missing sharp
 * binaries, corrupt file, …) we bail loudly so the client gets a real error
 * rather than silently storing broken data.
 */

const MAX_LONG_EDGE = 2000;
const MAX_BYTES = () => env().UPLOAD_MAX_MB * 1024 * 1024;

// Only allow images — we enforce both by incoming mime-type and by sharp's
// own output, which is always JPEG after processing.
const ACCEPTED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

/** Validate the incoming File before touching sharp/disk. */
export function validateUpload(file: File): { ok: true } | { ok: false; reason: string } {
  if (!ACCEPTED_MIMES.has(file.type)) return { ok: false, reason: 'unsupported_type' };
  if (file.size > MAX_BYTES()) return { ok: false, reason: 'file_too_large' };
  return { ok: true };
}

export async function saveUpload(file: File): Promise<PhotoRef> {
  const validation = validateUpload(file);
  if (!validation.ok) throw new Error(validation.reason);

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const id = crypto.randomUUID();
  const relPath = `${yyyy}/${mm}/${id}.jpg`;
  const baseDir = env().UPLOAD_DIR;
  const fullDir = path.join(baseDir, yyyy, mm);
  const fullPath = path.join(fullDir, `${id}.jpg`);

  await mkdir(fullDir, { recursive: true });

  const arrayBuf = await file.arrayBuffer();
  const inBuf = Buffer.from(arrayBuf);

  // sharp is loaded dynamically so the server can start even if the native
  // binary is missing in an environment that doesn't need uploads (smoke tests).
  type SharpModule = (input: Buffer) => {
    rotate: () => SharpInstance;
  };
  interface SharpInstance {
    rotate: () => SharpInstance;
    metadata: () => Promise<{ width?: number; height?: number }>;
    resize: (opts: { width?: number; height?: number; fit: 'inside' }) => SharpInstance;
    jpeg: (opts: { quality: number; mozjpeg?: boolean }) => SharpInstance;
    toBuffer: () => Promise<Buffer>;
  }
  let sharp: SharpModule;
  try {
    sharp = (await import('sharp')).default as unknown as SharpModule;
  } catch (err) {
    logger.error({ err }, 'sharp not available; refusing upload');
    throw new Error('image_processing_unavailable');
  }

  // Decoding / re-encoding can throw "unsupported image format", "input file
  // contains unsupported image format", etc. Treat all of those as
  // `invalid_image` so the handler can return a 400 rather than a 500.
  let outBuf: Buffer;
  let outMeta: { width?: number; height?: number };
  try {
    const pipeline = sharp(inBuf).rotate();
    const meta = await pipeline.metadata();
    const origW = meta.width ?? 0;
    const origH = meta.height ?? 0;
    let resize: { width?: number; height?: number } | null = null;
    if (Math.max(origW, origH) > MAX_LONG_EDGE) {
      resize =
        origW >= origH ? { width: MAX_LONG_EDGE } : { height: MAX_LONG_EDGE };
    }
    const processed = resize
      ? pipeline.resize({ ...resize, fit: 'inside' }).jpeg({ quality: 85, mozjpeg: true })
      : pipeline.jpeg({ quality: 85, mozjpeg: true });
    outBuf = await processed.toBuffer();
    outMeta = await sharp(outBuf).rotate().metadata();
  } catch (err) {
    logger.warn({ err, size: inBuf.length }, 'upload rejected by sharp');
    throw new Error('invalid_image');
  }

  await writeFile(fullPath, outBuf);

  return {
    path: relPath,
    w: outMeta.width ?? 0,
    h: outMeta.height ?? 0,
    size: outBuf.length
  };
}

/**
 * Resolve a request path against UPLOAD_DIR, refusing anything that would
 * escape the base directory (e.g. `../etc/passwd`). Returns null if the
 * resolved path is outside the base or doesn't exist.
 */
export async function resolveStoredPath(
  relPath: string
): Promise<{ fullPath: string; size: number } | null> {
  const baseDir = path.resolve(env().UPLOAD_DIR);
  const candidate = path.resolve(baseDir, relPath);
  if (!candidate.startsWith(baseDir + path.sep) && candidate !== baseDir) return null;
  try {
    const s = await stat(candidate);
    if (!s.isFile()) return null;
    return { fullPath: candidate, size: s.size };
  } catch {
    return null;
  }
}

export function mimeFor(pth: string): string {
  const ext = path.extname(pth).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

export { createReadStream, readFile };
