import { test, expect } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

test.describe('Hero Carousel — front end', () => {
  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('renders carousel region and next control', async ({ page }) => {
    await openPageEditor(page);

    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const slide = createBlock('core/cover', { dimRatio: 0, minHeight: 320 }, [
        createBlock('core/paragraph', { content: 'Slide one' }),
      ]);
      const slideTwo = createBlock(
        'core/cover',
        { dimRatio: 0, minHeight: 320 },
        [createBlock('core/paragraph', { content: 'Slide two' })]
      );
      const carousel = createBlock(
        'aggressive-blocks/hero-carousel',
        { autoplay: false, transition: 'fade' },
        [slide, slideTwo]
      );
      window.wp.data.dispatch('core/block-editor').insertBlock(carousel);
      await new Promise(r => setTimeout(r, 400));
    });

    const { id, url } = await publishAndGetUrl(page);
    pageId = id;
    await page.goto(url);

    const region = page
      .locator('[data-wp-interactive="aggressive-blocks/hero-carousel"]')
      .first();
    await region.waitFor();
    await expect(region).toHaveAttribute('role', 'region');
    await expect(region).toHaveAttribute('aria-roledescription', 'carousel');

    const next = region.locator('[data-wp-on--click="actions.next"]').first();
    await next.click();
    await expect(region).toBeVisible();
  });
});
