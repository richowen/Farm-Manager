import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { Cookies } from '@sveltejs/kit';
import { env, isHttpsOrigin } from './env';

/**
 * Single-user auth:
 *   - The password is supplied via APP_PASSWORD env var.
 *   - On first login attempt after boot we hash it with argon2id and cache the
 *     hash in memory (not on disk) — so rotating APP_PASSWORD takes effect on
 *     the next restart.
 *   - A successful login issues an HMAC-signed session cookie.
 *   - No user table, no email — just "are you holding a valid cookie".
 *
 * The /settings page can update the stored password_hash in the `settings`
 * table; if present, it overrides APP_PASSWORD until the container restarts
 * with a new env var.
 */

const COOKIE_NAME = 'fm_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface Session {
  authenticated: boolean;
  issuedAt: number;
}

let cachedEnvPasswordHash: string | null = null;
async function envPasswordHash(): Promise<string> {
  if (cachedEnvPasswordHash) return cachedEnvPasswordHash;
  cachedEnvPasswordHash = await argon2.hash(env().APP_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
  return cachedEnvPasswordHash;
}

export async function verifyPassword(attempt: string): Promise<boolean> {
  // Prefer a stored override hash if present (set via Settings page).
  try {
    const { findPasswordHashOverride } = await import('./repositories/settings');
    const override = await findPasswordHashOverride();
    if (override) {
      return argon2.verify(override, attempt).catch(() => false);
    }
  } catch {
    // repositories may not exist yet during Phase 1 bootstrapping.
  }
  // Fall back to the env-backed hash.
  try {
    const hash = await envPasswordHash();
    return await argon2.verify(hash, attempt);
  } catch {
    return false;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}

// ---- Cookie signing ---------------------------------------------------------

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function timingSafeEqStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const sig = sign(payload, env().SESSION_SECRET);
  return `${payload}.${sig}`;
}

function decodeSession(value: string): Session | null {
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = sign(payload, env().SESSION_SECRET);
  if (!timingSafeEqStr(sig, expected)) return null;
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Session;
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (parsed.authenticated !== true) return null;
    if (typeof parsed.issuedAt !== 'number') return null;
    if (Date.now() / 1000 - parsed.issuedAt > SESSION_TTL_SECONDS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readSessionCookie(cookies: Cookies): Promise<Session | null> {
  const raw = cookies.get(COOKIE_NAME);
  if (!raw) return null;
  return decodeSession(raw);
}

export function issueSessionCookie(cookies: Cookies): void {
  const session: Session = { authenticated: true, issuedAt: Math.floor(Date.now() / 1000) };
  cookies.set(COOKIE_NAME, encodeSession(session), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsOrigin(),
    maxAge: SESSION_TTL_SECONDS
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}

// ---- Login rate limiting ----------------------------------------------------
//
// Simple in-memory token bucket per IP. Good enough for a single-user, single-
// instance deployment behind a reverse proxy.

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const LOGIN_RATE_CAPACITY = 10;
const LOGIN_RATE_REFILL_PER_SECOND = 0.1; // 1 token every 10s

export function consumeLoginToken(key: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now() / 1000;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: LOGIN_RATE_CAPACITY, lastRefill: now };
    buckets.set(key, bucket);
  }
  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(
    LOGIN_RATE_CAPACITY,
    bucket.tokens + elapsed * LOGIN_RATE_REFILL_PER_SECOND
  );
  bucket.lastRefill = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { ok: true };
  }
  const retryAfter = Math.ceil((1 - bucket.tokens) / LOGIN_RATE_REFILL_PER_SECOND);
  return { ok: false, retryAfter };
}
