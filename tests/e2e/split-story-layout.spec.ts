import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

async function loadStyles(page: Page): Promise<string> {
  const path = 'build/blocks/split-story/style-index.css';
  if (process.env.WP_BASE_URL) {
    // Artifact acceptance has only the installed ZIP, with no local build.
    const response = await page.request.get(
      `${process.env.WP_BASE_URL}/wp-content/plugins/aggressive-blocks/${path}`
    );
    expect(response.ok()).toBe(true);
    return response.text();
  }
  return readFileSync(path, 'utf8');
}

test('nested gallery keeps its height and sticks within the split @webkit', async ({
  page,
}) => {
  const styles = await loadStyles(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`
    <style>
      body { margin: 0; }
      .gallery { display: flex; align-items: center; }
      .gallery img { width: 100%; height: 300px; }
      .aa-split-story__content { height: 1400px; }
      footer { height: 1000px; }
      ${styles}
    </style>
    <div class="aa-split-story aa-split-story--viewport aa-split-story--sticky"
         style="--aa-split-sticky-top:16px">
      <div class="aa-split-story__media">
        <div class="gallery"><img alt="Product" /></div>
      </div>
      <div class="aa-split-story__content">Product details</div>
    </div>
    <footer></footer>
  `);
  const media = page.locator('.aa-split-story__media');
  await expect(media).toHaveCSS('height', '300px');
  const gallery = await page.locator('.gallery').boundingBox();
  const initial = await media.boundingBox();
  expect(gallery!.y).toBe(initial!.y);

  await page.evaluate(() => window.scrollTo(0, 200));
  await expect.poll(async () => (await media.boundingBox())!.y).toBe(16);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect.poll(async () => (await media.boundingBox())!.y).toBe(-100);

  await page.setViewportSize({ width: 480, height: 800 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(media).toHaveCSS('position', 'static');
  await expect(media).toHaveCSS('height', '300px');
  const content = await page.locator('.aa-split-story__content').boundingBox();
  expect(content!.y).toBe(300);
});

test('standalone image and cover retain viewport sizing @webkit', async ({
  page,
}) => {
  const styles = await loadStyles(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const child of [
    '<img alt="Story" />',
    '<div class="wp-block-cover"></div>',
  ]) {
    await page.setContent(`
      <style>body { margin: 0; } ${styles}</style>
      <div class="aa-split-story aa-split-story--viewport aa-split-story--sticky">
        <div class="aa-split-story__media">${child}</div>
        <div class="aa-split-story__content">Story</div>
      </div>
    `);
    await expect(page.locator('.aa-split-story__media')).toHaveCSS(
      'height',
      '800px'
    );
    await page.setViewportSize({ width: 480, height: 800 });
    await expect(page.locator('.aa-split-story__media')).toHaveCSS(
      'height',
      '480px'
    );
    await page.setViewportSize({ width: 1280, height: 800 });
  }
});
