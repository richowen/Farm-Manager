import { query } from '../db';
import crypto from 'node:crypto';
import {
  DEFAULT_USE_TYPES,
  userSettingsSchema,
  type UpdateSettingsInput,
  type UserSettings
} from '$lib/schemas';

interface SettingsRow {
  data: Record<string, unknown>;
  password_hash: string | null;
}

/** Merge stored data with defaults + parse. Defaults handle migrations to new
 *  keys (useTypes, useColors, icalFeedToken, …) without a DB change. */
export async function getSettings(): Promise<UserSettings> {
  const { rows } = await query<SettingsRow>('SELECT data FROM settings WHERE id = 1');
  const raw = rows[0]?.data ?? {};
  return userSettingsSchema.parse({
    unitsPrimary: 'ha',
    baseLayer: 'esri',
    useTypes: [...DEFAULT_USE_TYPES],
    useColors: {},
    icalFeedToken: null,
    ...raw
  });
}

/**
 * One-off post-migration hook (called from migrate.ts).
 *
 * Flips `showLines` on idempotently for v0.2.0 → v0.2.1 upgraders that
 * already have `line`-kind locations, so their existing pipes/drains stay
 * visible after the upgrade. Fresh installs (no line rows yet) keep the
 * zod default of `false`. Runs only on the first invocation — once the
 * `showLines` key is present in the stored JSON it's a no-op.
 *
 * Safe to call unconditionally; it writes at most one UPDATE per install.
 */
export async function ensureShowLinesFlag(): Promise<void> {
  let raw: Record<string, unknown>;
  try {
    const { rows } = await query<SettingsRow>('SELECT data FROM settings WHERE id = 1');
    raw = rows[0]?.data ?? {};
  } catch {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'showLines')) return;

  let hasLines = false;
  try {
    const r = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM locations WHERE kind = 'line'`
    );
    hasLines = Number(r.rows[0]?.n ?? '0') > 0;
  } catch {
    hasLines = false;
  }

  const merged = userSettingsSchema.parse({
    unitsPrimary: 'ha',
    baseLayer: 'esri',
    useTypes: [...DEFAULT_USE_TYPES],
    useColors: {},
    icalFeedToken: null,
    ...raw,
    showLines: hasLines
  });
  try {
    await query(`UPDATE settings SET data = $1::jsonb WHERE id = 1`, [JSON.stringify(merged)]);
  } catch {
    // Persist is best-effort — on failure we just re-try next boot.
  }
}

export async function updateSettings(patch: UpdateSettingsInput): Promise<UserSettings> {
  const current = await getSettings();
  const merged: UserSettings = userSettingsSchema.parse({
    ...current,
    ...patch
  });
  await query(`UPDATE settings SET data = $1::jsonb WHERE id = 1`, [JSON.stringify(merged)]);
  return merged;
}

/** Generate a new iCal feed token (URL-safe, ~32 chars). */
export async function generateIcalToken(): Promise<string> {
  const token = crypto.randomBytes(24).toString('base64url');
  await updateSettings({ icalFeedToken: token });
  return token;
}

export async function clearIcalToken(): Promise<void> {
  await updateSettings({ icalFeedToken: null });
}

export async function verifyIcalToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  // Be fail-closed: any DB error (unreachable, migration not yet run, etc.)
  // must not leak feed data — return false so the caller emits 401.
  let storedToken: string | null;
  try {
    const s = await getSettings();
    storedToken = s.icalFeedToken;
  } catch {
    return false;
  }
  if (!storedToken) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(storedToken);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function findPasswordHashOverride(): Promise<string | null> {
  try {
    const { rows } = await query<{ password_hash: string | null }>(
      'SELECT password_hash FROM settings WHERE id = 1'
    );
    return rows[0]?.password_hash ?? null;
  } catch {
    return null;
  }
}

export async function setPasswordHashOverride(hash: string | null): Promise<void> {
  await query('UPDATE settings SET password_hash = $1 WHERE id = 1', [hash]);
}
