import { test, expect } from '@playwright/test';

/**
 * Smoke test: verifies the app boots and redirects unauthenticated users to
 * /login, and that the login page has the expected form.
 *
 * Full draw-a-field-and-log-an-event flow requires a live Postgres+PostGIS
 * and APP_PASSWORD env; it is covered separately in CI via docker-compose.
 */

test('redirects to login when unauthenticated', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.url()).toContain('/login');
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('healthz responds', async ({ request }) => {
  const res = await request.get('/healthz');
  // 200 if DB is up, 503 if it isn't; both are "served without auth".
  expect([200, 503]).toContain(res.status());
});

test('manifest.webmanifest is served', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.name).toBe('Farm Manager');
});

test('calendar.ics rejects missing or wrong token without going through auth', async ({
  request
}) => {
  // Without a token at all → 401 (not a redirect to /login).
  const noToken = await request.get('/calendar.ics');
  expect(noToken.status()).toBe(401);

  // Wrong token still 401 — never a login redirect.
  const wrongToken = await request.get('/calendar.ics?token=definitely-not-valid');
  expect(wrongToken.status()).toBe(401);
});

test('tasks page is behind auth', async ({ page }) => {
  const res = await page.goto('/tasks');
  expect(res?.url()).toContain('/login');
});

test('pins page is behind auth', async ({ page }) => {
  const res = await page.goto('/pins');
  expect(res?.url()).toContain('/login');
});

test('/api/pins requires a session', async ({ request }) => {
  const res = await request.get('/api/pins', { maxRedirects: 0 });
  expect(res.status()).toBe(401);
});

test('uploads route is behind auth', async ({ request }) => {
  // Disable follow-redirects so we see the 303 redirect to /login (which the
  // hooks middleware emits for page routes) rather than silently following it
  // and returning the login page 200.
  const res = await request.get('/uploads/2026/04/nope.jpg', { maxRedirects: 0 });
  expect([401, 302, 303, 307, 308, 404]).toContain(res.status());
});
