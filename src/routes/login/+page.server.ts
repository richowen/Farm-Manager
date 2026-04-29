import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { consumeLoginToken, issueSessionCookie, verifyPassword } from '$lib/server/auth';
import { env } from '$lib/server/env';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.session) {
    const next = url.searchParams.get('next') ?? '/';
    throw redirect(303, sanitizeNext(next));
  }
  return { appName: env().PUBLIC_APP_NAME };
};

function sanitizeNext(next: string): string {
  // Only allow same-origin relative paths.
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const ip = (() => {
      try {
        return getClientAddress();
      } catch {
        return 'unknown';
      }
    })();

    const rate = consumeLoginToken(ip);
    if (!rate.ok) {
      return fail(429, {
        error: `Too many attempts. Try again in ${rate.retryAfter ?? 10}s.`
      });
    }

    const data = await request.formData();
    const password = String(data.get('password') ?? '');
    const next = sanitizeNext(String(data.get('next') ?? '/'));

    if (!password) {
      return fail(400, { error: 'Password is required.' });
    }

    const ok = await verifyPassword(password);
    if (!ok) {
      // Small delay on failure to blunt online brute-force.
      await new Promise((r) => setTimeout(r, 300));
      return fail(401, { error: 'Incorrect password.' });
    }

    issueSessionCookie(cookies);
    throw redirect(303, next);
  }
};
