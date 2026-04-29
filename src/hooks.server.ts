import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { readSessionCookie } from '$lib/server/auth';
import { ensureMigrated } from '$lib/server/migrate';
import { logger } from '$lib/server/logger';

// One-off migration runner on boot (idempotent). Kicked off lazily on the first
// request so build-time `prerender` / CI doesn't need a DB.
let migrated: Promise<void> | null = null;
function startMigrations() {
  if (!migrated) {
    migrated = ensureMigrated().catch((err) => {
      logger.error({ err }, 'migration failure');
      // Reset so the next request retries.
      migrated = null;
      throw err;
    });
  }
  return migrated;
}

const PUBLIC_PATHS = new Set<string>(['/login', '/logout', '/healthz', '/manifest.webmanifest']);
const PUBLIC_API_PREFIXES = ['/api/auth/'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // SvelteKit internal, service worker, icons, favicon, etc.
  if (
    pathname.startsWith('/_app/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/favicon.ico' ||
    pathname === '/service-worker.js' ||
    pathname === '/sw.js' ||
    pathname === '/registerSW.js' ||
    pathname === '/workbox-window.js'
  ) {
    return true;
  }
  return false;
}

export const handle: Handle = async ({ event, resolve }) => {
  // Ensure DB is migrated before any real request (except healthz, which does its own probe).
  if (event.url.pathname !== '/healthz') {
    await startMigrations();
  }

  // Populate session locals.
  event.locals.session = await readSessionCookie(event.cookies);

  const pathname = event.url.pathname;

  if (!event.locals.session && !isPublicPath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    }
    const next = encodeURIComponent(pathname + event.url.search);
    throw redirect(303, `/login?next=${next}`);
  }

  return resolve(event);
};
