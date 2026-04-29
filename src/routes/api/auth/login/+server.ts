import type { RequestHandler } from './$types';
import { consumeLoginToken, issueSessionCookie, verifyPassword } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  const ip = (() => {
    try {
      return getClientAddress();
    } catch {
      return 'unknown';
    }
  })();

  const rate = consumeLoginToken(ip);
  if (!rate.ok) {
    return json(
      { error: 'rate_limited', retry_after: rate.retryAfter ?? 10 },
      { status: 429 }
    );
  }

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!password) return json({ error: 'password_required' }, { status: 400 });

  const ok = await verifyPassword(password);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 300));
    return json({ error: 'invalid_credentials' }, { status: 401 });
  }
  issueSessionCookie(cookies);
  return json({ ok: true });
};
