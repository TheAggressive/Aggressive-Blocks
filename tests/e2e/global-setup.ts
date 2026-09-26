import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Authenticate against the running WordPress site and store admin cookies.
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.WP_BASE_URL;
  if (!baseURL) {
    throw new Error('WP_BASE_URL is required for plugin e2e tests.');
  }

  mkdirSync('tests/e2e/.auth', { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  // bin/local/studio-e2e.sh passes Studio's auto-login URL, so a local run
  // never needs (or resets) the site's admin password. CI logs in with the
  // wp-env credentials.
  const autoLoginUrl = process.env.AB_E2E_AUTO_LOGIN_URL;
  if (autoLoginUrl) {
    if (new URL(autoLoginUrl).origin !== new URL(baseURL).origin) {
      throw new Error('The auto-login URL must belong to WP_BASE_URL.');
    }
    await page.goto(autoLoginUrl);
  } else {
    await page.goto('/wp-login.php');
    await page.locator('#user_login').fill(process.env.WP_USERNAME ?? 'admin');
    await page
      .locator('#user_pass')
      .fill(process.env.WP_PASSWORD ?? 'password');
    await page.locator('#wp-submit').click();
  }
  await page.waitForURL(/wp-admin/);

  await page.context().storageState({ path: 'tests/e2e/.auth/admin.json' });
  await browser.close();
}

export default globalSetup;
