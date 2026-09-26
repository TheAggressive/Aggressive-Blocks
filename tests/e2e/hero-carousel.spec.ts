import { test, expect, type Page } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

/** Insert a hero carousel with three slides, publish, and return the page. */
async function publishCarousel(
  page: Page,
  attributes: Record<string, unknown>
): Promise<{ id: number; url: string }> {
  await openPageEditor(page);
  await page.evaluate(async attrs => {
    const { createBlock } = window.wp.blocks;
    const slides = ['One', 'Two', 'Three'].map(label =>
      createBlock('core/cover', { dimRatio: 0, minHeight: 320 }, [
        createBlock('core/paragraph', { content: `Slide ${label}` }),
      ])
    );
    window.wp.data
      .dispatch('core/block-editor')
      .insertBlock(
        createBlock('aggressive-blocks/hero-carousel', attrs, slides)
      );
    await new Promise(r => setTimeout(r, 400));
  }, attributes);
  return publishAndGetUrl(page);
}

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

    const slides = region.locator('.aa-hero__slide');
    await expect(slides.nth(0)).toHaveClass(/\bis-active\b/);

    const next = region.locator('[data-wp-on--click="actions.next"]').first();
    await next.click();
    await expect(slides.nth(1)).toHaveClass(/\bis-active\b/);
    await expect(slides.nth(0)).not.toHaveClass(/\bis-active\b/);

    const firstDot = region.locator('.aa-hero__dot').first();
    await firstDot.click();
    await expect(slides.nth(0)).toHaveClass(/\bis-active\b/);
    await expect(firstDot).toHaveAttribute('aria-current', 'true');
  });

  test('opens the deep-linked slide in looping slide mode', async ({
    page,
  }) => {
    const { id, url } = await publishCarousel(page, {
      anchor: 'e2e-hero',
      deepLink: true,
      transition: 'slide',
      loop: true,
    });
    pageId = id;
    await page.goto(`${url}#e2e-hero-slide-3`);

    const slides = page.locator(
      '#e2e-hero .aa-hero__slide:not([data-aa-hero-clone])'
    );
    await expect(slides.nth(2)).toHaveClass(/\bis-active\b/);
    // Past the edge-clone re-align frame and the scroll settle.
    await page.waitForTimeout(1000);
    await expect(slides.nth(2)).toHaveClass(/\bis-active\b/);
    await expect(page).toHaveURL(/#e2e-hero-slide-3$/);
  });

  test('keeps autoplay paused while hovered after an arrow click', async ({
    page,
  }) => {
    const { id, url } = await publishCarousel(page, {
      autoplay: true,
      autoplaySpeed: 1000,
      pauseOnHover: true,
      transition: 'fade',
    });
    pageId = id;
    await page.goto(url);

    const region = page
      .locator('[data-wp-interactive="aggressive-blocks/hero-carousel"]')
      .first();
    const slides = region.locator('.aa-hero__slide');
    const next = region.locator('.aa-hero__arrow--next');

    await next.hover();
    await expect(region).not.toHaveClass(/\bis-playing\b/);
    const before = await slides.evaluateAll(els =>
      els.findIndex(el => el.classList.contains('is-active'))
    );
    const target = slides.nth((before + 1) % 3);

    await next.click();
    await expect(target).toHaveClass(/\bis-active\b/);

    // Well past the post-click delay and a full dwell, pointer still over it.
    await page.waitForTimeout(2500);
    await expect(target).toHaveClass(/\bis-active\b/);
    await expect(region).not.toHaveClass(/\bis-playing\b/);
  });
});
