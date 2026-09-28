import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

/**
 * Automated WCAG checks (axe-core) for every front-end block, in the states
 * a visitor meets: at rest after scrolling through the page, with the modal
 * open, and with keyboard-revealed carousel controls.
 *
 * Scans are scoped to the plugin's blocks so the active theme's own markup
 * does not decide the result. Content is authored to pass (dark hero slides,
 * default text colors), so any violation is the blocks' markup or styling.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Every block root: dynamic blocks carry `wp-block-aggressive-blocks-*`. */
const BLOCK_ROOTS = [
  '[class*="wp-block-aggressive-blocks-"]',
  '.wp-block-aggressive-apparel-ticker',
  '.aa-hero',
  '.aa-hscroll',
  '.aa-card-flip',
  '.aa-split-story',
  '.wp-block-aggressive-apparel-modal__trigger',
];

/** One readable line per violation, so a failure says what and where. */
function describeViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']
): string[] {
  return violations.map(
    violation =>
      `[${violation.impact}] ${violation.id}: ${violation.help} — ${violation.nodes
        .slice(0, 3)
        .map(node => node.target.join(' '))
        .join(' | ')}`
  );
}

async function scan(page: Page, include: string[]): Promise<string[]> {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  for (const selector of include) {
    if ((await page.locator(selector).count()) > 0) {
      builder = builder.include(selector);
    }
  }
  return describeViolations((await builder.analyze()).violations);
}

/** Scroll the page end to end so scroll-triggered animations have played. */
async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}

test.describe('Accessibility (axe)', () => {
  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('every block passes WCAG A/AA checks at rest, with the modal open, and with carousel controls revealed', async ({
    page,
  }) => {
    await openPageEditor(page);
    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const paragraph = (content: string) =>
        createBlock('core/paragraph', { content });
      const heading = (content: string) =>
        createBlock('core/heading', { level: 2, content });
      const darkSlide = (label: string) =>
        createBlock(
          'core/cover',
          {
            dimRatio: 100,
            customOverlayColor: '#1b1b1b',
            isDark: true,
            minHeight: 320,
          },
          [paragraph(`Slide ${label}`)]
        );

      window.wp.data.dispatch('core/block-editor').resetBlocks([
        createBlock(
          'aggressive-blocks/ticker',
          { showLabel: true, labelText: 'LIVE' },
          [paragraph('Ticker item'), paragraph('<a href="#t">Ticker link</a>')]
        ),
        createBlock(
          'aggressive-blocks/hero-carousel',
          {},
          ['One', 'Two', 'Three'].map(darkSlide)
        ),
        createBlock('aggressive-blocks/card-flip', {}, [
          createBlock('aggressive-blocks/card-flip-front', {}, [
            paragraph('Front of card'),
          ]),
          createBlock('aggressive-blocks/card-flip-back', {}, [
            paragraph('<a href="#back">Back of card</a>'),
          ]),
        ]),
        createBlock(
          'aggressive-blocks/horizontal-scroll',
          { ariaLabel: 'Accessibility gallery' },
          ['One', 'Two', 'Three'].map(label =>
            createBlock('core/group', {}, [
              heading(`Slide ${label}`),
              paragraph(`<a href="#s${label}">Shop ${label}</a>`),
            ])
          )
        ),
        createBlock('aggressive-blocks/split-story', {}, [
          createBlock('aggressive-blocks/split-story-media', {}, [
            paragraph('Media column'),
          ]),
          createBlock('aggressive-blocks/split-story-content', {}, [
            heading('Story'),
            paragraph('Story content'),
          ]),
        ]),
        createBlock('aggressive-blocks/animate-on-scroll', {}, [
          paragraph('Animated content'),
        ]),
        createBlock('aggressive-blocks/parallax', {}, [
          paragraph('Parallax content'),
        ]),
        createBlock(
          'aggressive-blocks/modal',
          { triggerLabel: 'Open accessibility modal' },
          [heading('Modal title'), paragraph('Modal body')]
        ),
        createBlock('aggressive-blocks/copyright', {
          ownerSource: 'custom',
          ownerName: 'Accessibility LLC',
        }),
      ]);
      await new Promise(resolve => setTimeout(resolve, 400));
    });

    const published = await publishAndGetUrl(page);
    pageId = published.id;
    await page.goto(published.url);
    await scrollThrough(page);

    // At rest.
    expect(await scan(page, BLOCK_ROOTS)).toEqual([]);

    // With the modal open (focus moves into the dialog).
    const trigger = page.locator('.wp-block-aggressive-apparel-modal__trigger');
    await trigger.click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    // Scan the settled dialog: mid-fade text measures as low contrast.
    await dialog.evaluate(el =>
      Promise.all(
        el.getAnimations({ subtree: true }).map(animation => animation.finished)
      )
    );
    expect(await scan(page, ['dialog[open]'])).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Horizontal-scroll controls revealed for keyboard users (opacity 0 at
    // rest, so contrast is only meaningful once shown).
    // Back above the gallery so it returns to slide 1. The controls follow
    // scroll on the next frame, so wait for that state before Shift+Tab from
    // the viewport, which is then real keyboard navigation onto Next.
    await page.evaluate(() => window.scrollTo(0, 0));
    const gallery = page.locator('.aa-hscroll').first();
    const next = gallery.locator('.aa-hscroll__control--next');
    await expect(gallery.locator('.aa-hscroll__control--prev')).toBeDisabled();
    await expect(next).toBeEnabled();
    await gallery.locator('.aa-hscroll__viewport').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(next).toBeFocused();
    await expect(next).toHaveCSS('opacity', '1');
    expect(await scan(page, ['.aa-hscroll'])).toEqual([]);
  });
});
