import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from './env';
import { logger } from './logger';
import type { PhotoRef } from '$lib/schemas';

/**
 * Media storage.
 *
 * Images are written to `${UPLOAD_DIR}/YYYY/MM/<uuid>.jpg`. They are run
 * through `sharp` to strip EXIF (keeping orientation), auto-rotate, and
 * downscale anything with a long edge >2000 px.
 *
 * Videos are stored as-is under `${UPLOAD_DIR}/YYYY/MM/<uuid>.<ext>`. No
 * server-side transcoding is performed — the raw file is saved and served back
 * with Range-request support so browsers can seek without downloading the
 * whole file.
 */

const MAX_LONG_EDGE = 2000;
const MAX_BYTES = () => env().UPLOAD_MAX_MB * 1024 * 1024;

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',   // .mov
  'video/webm',
  'video/x-m4v',
  'video/x-msvideo'   // .avi
]);

const ACCEPTED_MIMES = new Set([...IMAGE_MIMES, ...VIDEO_MIMES]);

function videoExtForMime(mime: string): string {
  switch (mime) {
    case 'video/mp4':        return 'mp4';
    case 'video/quicktime':  return 'mov';
    case 'video/webm':       return 'webm';
    case 'video/x-m4v':      return 'm4v';
    case 'video/x-msvideo':  return 'avi';
    default:                 return 'mp4';
  }
}

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
  const baseDir = env().UPLOAD_DIR;
  const fullDir = path.join(baseDir, yyyy, mm);

  await mkdir(fullDir, { recursive: true });

  const arrayBuf = await file.arrayBuffer();
  const inBuf = Buffer.from(arrayBuf);

  // ---- Video: store as-is, no transcoding ------------------------------------
  if (VIDEO_MIMES.has(file.type)) {
    const ext = videoExtForMime(file.type);
    const relPath = `${yyyy}/${mm}/${id}.${ext}`;
    const fullPath = path.join(fullDir, `${id}.${ext}`);
    await writeFile(fullPath, inBuf);
    logger.info({ relPath, size: inBuf.length }, 'video stored');
    // w/h are 0 for video — dimensions aren't known without ffprobe.
    return { path: relPath, w: 0, h: 0, size: inBuf.length };
  }

  // ---- Image: process through sharp ------------------------------------------
  const relPath = `${yyyy}/${mm}/${id}.jpg`;
  const fullPath = path.join(fullDir, `${id}.jpg`);

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

  // Decoding / re-encoding can throw "unsupported image format", etc. Treat
  // all of those as `invalid_image` so the handler returns 400.
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
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.avi') return 'video/x-msvideo';
  return 'application/octet-stream';
}

export { createReadStream, readFile };
