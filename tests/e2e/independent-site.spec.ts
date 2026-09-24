import { expect, test } from '@playwright/test';

import { deletePage, openPageEditor, publishAndGetUrl } from './helpers';

test.describe('Independent site', () => {
  test('activates the plugin on Twenty Twenty-Five without Aggressive Apparel', async ({
    page,
  }) => {
    await page.goto('/wp-admin/plugins.php');
    const pluginRow = page.locator('tr[data-slug="aggressive-blocks"]');
    await expect(pluginRow).toBeVisible();
    await expect(pluginRow.locator('.deactivate a')).toBeVisible();

    await page.goto('/wp-admin/themes.php');
    await expect(page.locator('.theme.active')).toContainText(
      /Twenty Twenty-Five/i
    );

    const html = await page.content();
    expect(html).not.toMatch(/\/themes\/aggressive-apparel\//);
  });

  test('registers migrated blocks in the inserter and renders one on the frontend', async ({
    page,
  }) => {
    await openPageEditor(page);

    const names = await page.evaluate(() =>
      (
        window.wp.data.select('core/blocks').getBlockTypes() as Array<{
          name: string;
        }>
      ).map(block => block.name)
    );

    expect(names).toContain('aggressive-blocks/copyright');
    expect(names).toContain('aggressive-blocks/modal');
    expect(names).toContain('aggressive-blocks/card-flip');

    await page.evaluate(() => {
      window.wp.data.dispatch('core/block-editor').resetBlocks([
        window.wp.blocks.createBlock('aggressive-blocks/copyright', {
          ownerSource: 'custom',
          ownerName: 'Independent Site LLC',
          prefix: '©',
        }),
      ]);
    });

    const published = await publishAndGetUrl(page);

    try {
      await page.goto(published.url);
      await expect(page.locator('body')).toContainText('Independent Site LLC');
      const frontend = await page.content();
      expect(frontend).not.toMatch(/\/themes\/aggressive-apparel\//);
    } finally {
      await deletePage(page, published.id);
    }
  });
});
