import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, withTransaction } from './db';
import { logger } from './logger';

/**
 * Very small forward-only migration runner. Reads *.sql files in lexicographic
 * order from db/migrations/ and applies each one exactly once.
 *
 * We keep the filename list as the source of truth — no checksums, no
 * rollbacks. That's acceptable for a single-user self-hosted app.
 */

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    name         text PRIMARY KEY,
    applied_at   timestamptz NOT NULL DEFAULT now()
  );
`;

function migrationsDir(): string {
  // In dev: <project>/db/migrations. In the built container image we copy the
  // same db/migrations/ folder alongside build/ (see Dockerfile).
  // Resolve relative to process.cwd() so it works in both cases.
  return path.resolve(process.cwd(), 'db', 'migrations');
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort();
}

export async function ensureMigrated(): Promise<void> {
  const client = await pool().connect();
  try {
    // Bootstrap the migrations table first.
    await client.query(MIGRATIONS_TABLE);
  } finally {
    client.release();
  }

  const dir = migrationsDir();
  let files: string[];
  try {
    files = await listFiles(dir);
  } catch (err) {
    logger.warn({ err, dir }, 'no migrations directory found; skipping');
    return;
  }

  const applied = await pool()
    .query<{ name: string }>('SELECT name FROM _migrations')
    .then((r) => new Set(r.rows.map((r) => r.name)));

  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = path.join(dir, file);
    const sql = await readFile(fullPath, 'utf8');
    logger.info({ file }, 'applying migration');
    await withTransaction(async (client) => {
      // Split on our explicit `-- +migrate ...` markers so we can apply multi-
      // statement files without depending on server-side split rules. If no
      // markers are present, execute the whole file as one statement block.
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file]);
    });
    logger.info({ file }, 'migration applied');
  }
}

// Allow running migrations manually: `node build/migrate.js` or `tsx src/lib/server/migrate.ts`.
if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  ensureMigrated()
    .then(() => {
      logger.info('migrations complete');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'migration failed');
      process.exit(1);
    });
}
