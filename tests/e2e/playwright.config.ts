import { defineConfig, devices } from '@playwright/test';

// The app has to be running already, see setup.sh.
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // desktop layout ("lg" display type)
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
});
