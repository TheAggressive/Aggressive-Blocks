import { test, expect } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

test.describe('Copyright — front end', () => {
  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('renders a copyright notice after insert and publish', async ({
    page,
  }) => {
    await openPageEditor(page);

    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const block = createBlock('aggressive-blocks/copyright', {
        showStartYear: false,
        prefix: '©',
      });
      window.wp.data.dispatch('core/block-editor').insertBlock(block);
      await new Promise(r => setTimeout(r, 400));
    });

    const { id, url } = await publishAndGetUrl(page);
    pageId = id;
    await page.goto(url);

    const notice = page
      .locator(
        '.wp-block-aggressive-apparel-copyright, .wp-block-aggressive-blocks-copyright'
      )
      .first();
    await notice.waitFor();
    await expect(notice).toContainText('©');
    await expect(notice).toContainText(String(new Date().getUTCFullYear()));
  });
});
