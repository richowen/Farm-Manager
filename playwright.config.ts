import { defineConfig, devices } from '@playwright/test';

// Minimum env needed to start the Node server without a live database.
// In CI the real DATABASE_URL / SESSION_SECRET are injected by the workflow.
const E2E_PORT = '4173';
const testEnv: Record<string, string> = {
  PORT: E2E_PORT,
  NODE_ENV: 'production',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://farm:farm@127.0.0.1:5432/farm',
  APP_PASSWORD: process.env.APP_PASSWORD ?? 'e2e-smoke-test-password',
  // Must be ≥ 32 chars; this value is only used in local smoke runs.
  SESSION_SECRET:
    process.env.SESSION_SECRET ?? 'e2e0smoke0test0secret0placeholder0xxxxxxxx0000000000000000000000000'
};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Use the real production server, not `vite preview` (which doesn't
        // run SSR routes for the Node adapter output).
        command: 'node build/index.js',
        url: `http://127.0.0.1:${E2E_PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        env: testEnv
      }
});
