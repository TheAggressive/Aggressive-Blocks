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

  test('styles block controls without the Aggressive Apparel theme', async ({
    page,
  }) => {
    await openPageEditor(page);

    await page.evaluate(() => {
      const { createBlock } = window.wp.blocks;
      window.wp.data
        .dispatch('core/block-editor')
        .resetBlocks([
          createBlock('aggressive-blocks/ticker', {}, [
            createBlock('core/paragraph', { content: 'Ticker item' }),
          ]),
          createBlock('aggressive-blocks/card-flip', {}, [
            createBlock('aggressive-blocks/card-flip-front', {}, [
              createBlock('core/paragraph', { content: 'FRONT' }),
            ]),
            createBlock('aggressive-blocks/card-flip-back', {}, [
              createBlock('core/paragraph', { content: 'BACK' }),
            ]),
          ]),
          createBlock(
            'aggressive-blocks/modal',
            { triggerLabel: 'Open independent modal' },
            [createBlock('core/paragraph', { content: 'Modal body' })]
          ),
        ]);
    });

    const published = await publishAndGetUrl(page);

    try {
      await page.goto(published.url);
      expect(await page.content()).not.toMatch(
        /\/themes\/aggressive-apparel\//
      );

      // Layout size (offset*) — unaffected by reveal transforms.
      const size = (selector: string) =>
        page
          .locator(selector)
          .first()
          .evaluate(el => {
            const element = el as HTMLElement;
            return {
              width: element.offsetWidth,
              height: element.offsetHeight,
              radius: getComputedStyle(element).borderTopLeftRadius,
            };
          });

      // The shared icon-button baseline: a round 44px target (2.75rem).
      const toggle = await size('.aa-card-flip__toggle');
      expect(toggle.width).toBeGreaterThanOrEqual(44);
      expect(toggle.height).toBeGreaterThanOrEqual(44);
      expect(toggle.radius).not.toBe('0px');

      // A slim ticker still gets at least a 24px control (WCAG 2.5.8).
      const pause = await size('.ticker__pause');
      expect(pause.height).toBeGreaterThanOrEqual(24);

      // Keyboard focus on the modal trigger shows a ring, and a transparent
      // outline that forced-colors mode draws in place of the box-shadow.
      const trigger = page.locator(
        '.wp-block-aggressive-apparel-modal__trigger'
      );
      await trigger.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(trigger).toBeFocused();
      // Poll past the box-shadow transition: its first frame is transparent.
      await expect
        .poll(() => trigger.evaluate(el => getComputedStyle(el).boxShadow))
        .toMatch(/rgb\(\d+, \d+, \d+\) 0px 0px 0px [1-9]/);
      expect(
        await trigger.evaluate(el => getComputedStyle(el).outlineStyle)
      ).toBe('solid');

      await trigger.click();
      const close = page.locator('.wp-block-aggressive-apparel-modal__close');
      await expect(close).toBeVisible();
      expect(
        (await size('.wp-block-aggressive-apparel-modal__close')).height
      ).toBeGreaterThanOrEqual(24);
    } finally {
      await deletePage(page, published.id);
    }
  });
});
