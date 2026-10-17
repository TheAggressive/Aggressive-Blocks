import { test, expect } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

test.describe('Native editor controls', () => {
  let pageId = 0;

  test.beforeEach(async ({ page }) => {
    await page.addLocatorHandler(
      page.getByRole('dialog').filter({
        has: page.getByRole('heading', {
          name: 'Choose a pattern',
          exact: true,
        }),
      }),
      async chooser => {
        await chooser.getByRole('button', { name: /^(Close|Cancel)$/ }).click();
      }
    );
    await openPageEditor(page);
    pageId = await page.evaluate(() =>
      window.wp.data.select('core/editor').getCurrentPostId()
    );
  });

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test(
    'presets and sequence cards retain their settings and keyboard behavior',
    { tag: '@webkit' },
    async ({ page }) => {
      const clientId = await page.evaluate(() => {
        const { createBlock } = window.wp.blocks;
        const block = createBlock('aggressive-blocks/animate-on-scroll', {}, [
          createBlock('core/paragraph', { content: 'First child' }),
          createBlock('core/paragraph', { content: 'Second child' }),
        ]);
        const editor = window.wp.data.dispatch('core/block-editor');
        editor.insertBlock(block);
        editor.selectBlock(block.clientId);
        window.wp.data
          .dispatch('core/interface')
          .enableComplementaryArea('core', 'edit-post/block');
        return block.clientId;
      });
      const preset = page
        .locator('.aa-preset-picker__tile')
        .filter({ hasText: 'Hero Reveal' });
      await preset.click();
      await expect(preset).toHaveAttribute('aria-pressed', 'true');
      const cards = page.locator(
        '.aggressive-apparel-animate-on-scroll-sequence__step'
      );
      await expect(cards).toHaveCount(3);
      const firstToggle = cards.first().locator('[aria-expanded]');
      await firstToggle.focus();
      await page.keyboard.press('Enter');
      await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
      await cards
        .first()
        .getByLabel('Animation', { exact: true })
        .selectOption('zoom');
      await cards
        .first()
        .getByRole('button', { name: 'Duplicate step', exact: true })
        .click();
      await expect(cards).toHaveCount(4);
      await expect(cards.first().locator('[aria-expanded]')).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await cards
        .first()
        .getByRole('button', { name: 'Move step down', exact: true })
        .click();
      await expect(cards.nth(1).locator('[aria-expanded]')).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await cards
        .first()
        .getByRole('button', { name: 'Remove step', exact: true })
        .click();
      await expect(cards).toHaveCount(3);
      await expect
        .poll(() =>
          page.evaluate(
            id =>
              window.wp.data
                .select('core/block-editor')
                .getBlockAttributes(id)
                .animationSequence.map(
                  (step: { animation: string }) => step.animation
                ),
            clientId
          )
        )
        .toEqual(['zoom', 'slide', 'slide']);
      // The native card styles must be present in the editor document.
      await expect(cards.first()).toHaveCSS('border-top-style', 'solid');
      await page.screenshot({
        path: test.info().outputPath('sequence-controls.png'),
      });
      await page
        .locator('.aa-preset-picker__tile')
        .filter({ hasText: 'Gentle Fade' })
        .click();
      await expect(cards).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            id =>
              window.wp.data.select('core/block-editor').getBlockAttributes(id)
                .animation,
            clientId
          )
        )
        .toBe('fade');
      await publishAndGetUrl(page);
    }
  );

  test('text fields persist values and scheduling labels target the date control', async ({
    page,
  }) => {
    const ids = await page.evaluate(() => {
      const { createBlock } = window.wp.blocks;
      const modal = createBlock('aggressive-blocks/modal', {}, [
        createBlock('core/paragraph', { content: 'Modal content' }),
      ]);
      const slide = createBlock('core/cover', { minHeight: 200 }, [
        createBlock('core/paragraph', { content: 'Scheduled slide' }),
      ]);
      const editor = window.wp.data.dispatch('core/block-editor');
      editor.insertBlocks([
        modal,
        createBlock('aggressive-blocks/hero-carousel', {}, [slide]),
      ]);
      editor.selectBlock(modal.clientId);
      window.wp.data
        .dispatch('core/interface')
        .enableComplementaryArea('core', 'edit-post/block');
      return { modal: modal.clientId, slide: slide.clientId };
    });
    await page
      .getByLabel('Dialog Name', { exact: true })
      .fill('Updated dialog name');
    await page
      .getByLabel('Trigger Button Label', { exact: true })
      .fill('View details');
    await expect
      .poll(() =>
        page.evaluate(
          id =>
            window.wp.data.select('core/block-editor').getBlockAttributes(id)
              .dialogLabel,
          ids.modal
        )
      )
      .toBe('Updated dialog name');
    await page.evaluate(
      id => window.wp.data.dispatch('core/block-editor').selectBlock(id),
      ids.slide
    );
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Hero Slide', exact: true }).click();
    const start = page.getByRole('button', { name: /^Show from:/ });
    await expect(start).toHaveAttribute('aria-describedby', /__help$/);
    const controlId = await start.getAttribute('id');
    await expect(page.locator(`label[for="${controlId}"]`)).toHaveText(
      'Show from'
    );
    await start.click();
    await expect(
      page.getByRole('button', { name: 'Done', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(start).toBeFocused();
    const { url } = await publishAndGetUrl(page);
    await page.goto(url);
    await expect(
      page.getByRole('button', { name: 'View details', exact: true })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'View details', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Updated dialog name', exact: true })
    ).toBeVisible();
  });
});
