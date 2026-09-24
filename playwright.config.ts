import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [['list'], ['./tests/e2e/no-skips-reporter.ts']],
  use: {
    baseURL: process.env.WP_BASE_URL,
    storageState: 'tests/e2e/.auth/admin.json',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
