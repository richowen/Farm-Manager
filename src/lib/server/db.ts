import pg from 'pg';
import { env } from './env';
import { logger } from './logger';

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function pool(): pg.Pool {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  _pool.on('error', (err) => {
    logger.error({ err }, 'idle pg client error');
  });
  return _pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: readonly unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool().query<T>(text, params as unknown[] | undefined);
    const duration = Date.now() - start;
    if (duration > 500) {
      logger.warn({ duration, text: text.slice(0, 120) }, 'slow query');
    }
    return res;
  } catch (err) {
    logger.error({ err, text: text.slice(0, 120) }, 'query error');
    throw err;
  }
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function ping(): Promise<boolean> {
  try {
    const res = await pool().query('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
