import { test, expect } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

test.describe('Ticker — front end', () => {
  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('renders marquee and pauses on control click', async ({ page }) => {
    await openPageEditor(page);

    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const ticker = createBlock(
        'aggressive-blocks/ticker',
        { speed: 30, showLabel: true, labelText: 'LIVE' },
        [createBlock('core/paragraph', { content: 'Ticker item' })]
      );
      window.wp.data.dispatch('core/block-editor').insertBlock(ticker);
      await new Promise(r => setTimeout(r, 400));
    });

    const { id, url } = await publishAndGetUrl(page);
    pageId = id;
    await page.goto(url);

    const ticker = page
      .locator('[data-wp-interactive="aggressive-blocks/ticker"]')
      .first();
    await ticker.waitFor();
    await expect(ticker).toHaveAttribute('role', 'marquee');
    await expect(ticker.locator('.ticker__label')).toContainText('LIVE');

    const pause = ticker.locator('.ticker__pause');
    await pause.click();
    await expect(ticker).toHaveClass(/is-paused/);
  });
});
