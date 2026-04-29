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
