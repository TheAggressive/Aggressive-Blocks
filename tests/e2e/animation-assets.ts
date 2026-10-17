import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Exercise the installed plugin in WordPress lanes, including ZIP acceptance. */
export async function readAnimationAsset(
  page: Page,
  baseURL: string | undefined,
  filename: string,
  block: 'animate-on-scroll' | 'card-flip' = 'animate-on-scroll'
): Promise<string> {
  const assetPath = `build/blocks-interactivity/${block}/${filename}`;
  if (!baseURL) {
    return readFileSync(path.resolve(assetPath), 'utf8');
  }
  const url = new URL(
    `wp-content/plugins/aggressive-blocks/${assetPath}`,
    `${baseURL.replace(/\/$/, '')}/`
  );
  const response = await page.request.get(url.href);
  expect(response.ok(), `Installed animation asset: ${url.href}`).toBe(true);
  return response.text();
}
