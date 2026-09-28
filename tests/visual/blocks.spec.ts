import { test, expect, type Page } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from '../e2e/helpers';

/**
 * Canonical states of the blocks whose look carries the most layout: one
 * screenshot per state, on a page of fixed content with no images, web fonts
 * loaded, and motion reduced. Mobile repeats only the layouts that change
 * there (@mobile).
 */

let pageId = 0;
let pageUrl = '';

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.WP_BASE_URL,
    storageState: 'tests/e2e/.auth/admin.json',
  });
  const page = await context.newPage();
  await openPageEditor(page);
  await page.evaluate(async () => {
    const { createBlock } = window.wp.blocks;
    const paragraph = (content: string) =>
      createBlock('core/paragraph', { content });
    const heading = (content: string) =>
      createBlock('core/heading', { level: 2, content });
    const panel = (color: string, blocks: unknown[]) =>
      createBlock(
        'core/group',
        {
          style: {
            color: { background: color, text: '#ffffff' },
            spacing: {
              padding: {
                top: '32px',
                bottom: '32px',
                left: '32px',
                right: '32px',
              },
            },
          },
        },
        blocks
      );
    const slide = (label: string, color: string) =>
      createBlock(
        'core/cover',
        {
          dimRatio: 100,
          customOverlayColor: color,
          isDark: true,
          minHeight: 360,
        },
        [heading(`Slide ${label}`), paragraph('Fixed slide copy.')]
      );

    window.wp.data.dispatch('core/block-editor').resetBlocks([
      createBlock('aggressive-blocks/hero-carousel', { autoplay: false }, [
        slide('One', '#1b1b1b'),
        slide('Two', '#3a1f5c'),
        slide('Three', '#0f4c3a'),
      ]),
      createBlock(
        'aggressive-blocks/ticker',
        { showLabel: true, labelText: 'NEW' },
        [paragraph('Free shipping over $50'), paragraph('Drop 07 is live')]
      ),
      createBlock(
        'aggressive-blocks/card-flip',
        { flipOn: 'click', style: { dimensions: { aspectRatio: '16/9' } } },
        [
          createBlock(
            'aggressive-blocks/card-flip-front',
            { style: { color: { background: '#1b1b1b', text: '#ffffff' } } },
            [heading('Front'), paragraph('Heavyweight fleece, 480gsm.')]
          ),
          createBlock(
            'aggressive-blocks/card-flip-back',
            { style: { color: { background: '#0f4c3a', text: '#ffffff' } } },
            [heading('Back'), paragraph('Dense loopback that holds its shape.')]
          ),
        ]
      ),
      createBlock('aggressive-blocks/split-story', {}, [
        createBlock('aggressive-blocks/split-story-media', {}, [
          createBlock(
            'core/cover',
            {
              dimRatio: 100,
              customOverlayColor: '#2d2d2d',
              isDark: true,
              minHeight: 420,
            },
            [paragraph('Media column')]
          ),
        ]),
        createBlock('aggressive-blocks/split-story-content', {}, [
          heading('The story'),
          paragraph('Cut, sewn, and finished in small runs.'),
        ]),
      ]),
      createBlock(
        'aggressive-blocks/horizontal-scroll',
        { ariaLabel: 'Visual gallery', itemWidth: '60vw', align: 'full' },
        ['One', 'Two', 'Three'].map((label, index) =>
          panel(['#1b1b1b', '#3a1f5c', '#0f4c3a'][index], [
            heading(`Panel ${label}`),
            paragraph('Scroll to move sideways.'),
          ])
        )
      ),
      createBlock(
        'aggressive-blocks/modal',
        { triggerLabel: 'Open size guide' },
        [heading('Size guide'), paragraph('Measure a hoodie you already own.')]
      ),
    ]);
    await new Promise(resolve => setTimeout(resolve, 400));
  });
  const published = await publishAndGetUrl(page);
  pageId = published.id;
  pageUrl = published.url;
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.WP_BASE_URL,
    storageState: 'tests/e2e/.auth/admin.json',
  });
  const page = await context.newPage();
  await openPageEditor(page);
  await deletePage(page, pageId);
  await context.close();
});

/** Load the page and wait for web fonts, so glyphs never swap mid-capture. */
async function open(page: Page): Promise<void> {
  await page.goto(pageUrl);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test('hero carousel', { tag: '@mobile' }, async ({ page }) => {
  await open(page);
  await expect(page.locator('.aa-hero').first()).toHaveScreenshot(
    'hero-carousel.png'
  );
});

test('ticker', async ({ page }) => {
  await open(page);
  await expect(
    page.locator('.wp-block-aggressive-apparel-ticker').first()
  ).toHaveScreenshot('ticker.png');
});

test('card flip, front and back', async ({ page }) => {
  await open(page);
  const card = page.locator('.aa-card-flip').first();
  await expect(card).toHaveScreenshot('card-flip-front.png');

  await card.locator('.aa-card-flip__toggle').click();
  await expect(card).toHaveClass(/is-flipped/);
  await expect(card).toHaveScreenshot('card-flip-back.png');
});

test('split story', { tag: '@mobile' }, async ({ page }) => {
  await open(page);
  await expect(page.locator('.aa-split-story').first()).toHaveScreenshot(
    'split-story.png'
  );
});

test(
  'horizontal scroll at its first slide',
  { tag: '@mobile' },
  async ({ page }) => {
    // Reduced motion renders the gallery as a static stack; this is the
    // motion layout. Screenshots still freeze animations.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page);
    const gallery = page.locator('.aa-hscroll').first();
    await expect(gallery).toHaveClass(/\bis-(enhanced|snap)\b/);
    // Bring the gallery's first screen into view: pinned on desktop, the
    // native swipe carousel on mobile.
    await gallery.locator('.aa-hscroll__range').evaluate(el => {
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY);
    });
    await expect(gallery.locator('.aa-hscroll__control--prev')).toBeDisabled();
    await expect(gallery.locator('.aa-hscroll__stage')).toHaveScreenshot(
      'horizontal-scroll.png'
    );
  }
);

test('modal open', { tag: '@mobile' }, async ({ page }) => {
  await open(page);
  await page.locator('.wp-block-aggressive-apparel-modal__trigger').click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toBeVisible();
  // The dialog panel alone: the page behind it shows through the backdrop,
  // and its title carries the E2E timestamp.
  await expect(dialog).toHaveScreenshot('modal-open.png');
});
