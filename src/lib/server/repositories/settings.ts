import { query } from '../db';
import {
  userSettingsSchema,
  type UpdateSettingsInput,
  type UserSettings
} from '$lib/schemas';

interface SettingsRow {
  data: Record<string, unknown>;
  password_hash: string | null;
}

export async function getSettings(): Promise<UserSettings> {
  const { rows } = await query<SettingsRow>('SELECT data FROM settings WHERE id = 1');
  const raw = rows[0]?.data ?? {};
  // Merge with defaults via parse.
  return userSettingsSchema.parse({
    unitsPrimary: 'ha',
    baseLayer: 'esri',
    ...raw
  });
}

export async function updateSettings(patch: UpdateSettingsInput): Promise<UserSettings> {
  const current = await getSettings();
  const merged: UserSettings = userSettingsSchema.parse({
    ...current,
    ...patch
  });
  await query(
    `UPDATE settings SET data = $1::jsonb WHERE id = 1`,
    [JSON.stringify(merged)]
  );
  return merged;
}

export async function findPasswordHashOverride(): Promise<string | null> {
  try {
    const { rows } = await query<{ password_hash: string | null }>(
      'SELECT password_hash FROM settings WHERE id = 1'
    );
    return rows[0]?.password_hash ?? null;
  } catch {
    // Table may not exist yet during very early bootstrap.
    return null;
  }
}

export async function setPasswordHashOverride(hash: string | null): Promise<void> {
  await query('UPDATE settings SET password_hash = $1 WHERE id = 1', [hash]);
}
