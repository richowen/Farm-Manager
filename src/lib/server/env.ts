/**
 * Centralised environment variable access. Fails fast on missing required vars
 * so the container doesn't start half-broken.
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return v;
}

function optionalEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

// Lazily evaluated so that, eg, `svelte-check` can import modules that ultimately
// reference env.ts without a live database.
let _cached: {
  DATABASE_URL: string;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  ORIGIN: string;
  PUBLIC_APP_NAME: string;
  UPLOAD_DIR: string;
  UPLOAD_MAX_MB: number;
} | null = null;

export function env() {
  if (_cached) return _cached;
  _cached = {
    DATABASE_URL: requireEnv('DATABASE_URL'),
    APP_PASSWORD: requireEnv('APP_PASSWORD'),
    SESSION_SECRET: requireEnv('SESSION_SECRET'),
    ORIGIN: optionalEnv('ORIGIN', ''),
    PUBLIC_APP_NAME: optionalEnv('PUBLIC_APP_NAME', 'Farm Manager'),
    UPLOAD_DIR: optionalEnv('UPLOAD_DIR', '/data/uploads'),
    UPLOAD_MAX_MB: Number(optionalEnv('UPLOAD_MAX_MB', '10'))
  };
  if (_cached.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters (use `openssl rand -hex 32`)');
  }
  return _cached;
}

export function isHttpsOrigin(): boolean {
  const origin = process.env.ORIGIN ?? '';
  return origin.startsWith('https://');
}
