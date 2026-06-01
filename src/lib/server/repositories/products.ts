import { query } from '../db';

export async function listProducts(): Promise<string[]> {
  const { rows } = await query<{ name: string }>(
    'SELECT name FROM products ORDER BY last_used_at DESC'
  );
  return rows.map((r) => r.name);
}

export async function upsertProduct(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await query(
    `INSERT INTO products (name, last_used_at)
     VALUES ($1, now())
     ON CONFLICT (name) DO UPDATE SET last_used_at = now()`,
    [trimmed]
  );
}
