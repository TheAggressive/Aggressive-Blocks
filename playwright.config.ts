import { defineConfig, devices } from '@playwright/test';

// Set by bin/local/studio-e2e.sh. The independent-site spec proves the plugin
// runs where Aggressive Apparel is not installed, which only CI's clean wp-env
// can show: a Studio site that serves the theme's own checkout always has it.
const studioRun = process.env.AB_E2E_STUDIO === '1';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: studioRun ? ['**/independent-site.spec.ts'] : [],
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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // WebKit (Safari) runs only the tests tagged @webkit: behavior engines
    // implement differently (focus and inert, <dialog>, scroll and
    // scroll-driven animation, pointer input, reduced motion). Chromium
    // runs everything.
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      grep: /@webkit/,
    },
  ],
});
