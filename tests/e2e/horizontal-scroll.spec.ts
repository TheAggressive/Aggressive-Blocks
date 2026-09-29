import {
  test,
  expect,
  devices,
  type Locator,
  type Page,
} from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

type GalleryOptions = {
  snapBehavior?: 'off' | 'paged';
  count?: number;
  desktopBehavior?: 'pinned' | 'inline';
  activation?: 'top' | 'center' | 'bottom';
  itemWidth?: string;
};

/**
 * Build a horizontal-scroll block and return the published front-end URL.
 * `snapBehavior: 'off'` is the smooth scrub engine; `'paged'` is stepped.
 */
async function buildGallery(
  page: Page,
  options: GalleryOptions | 'off' | 'paged' = {},
  countArg?: number
): Promise<string> {
  // Back-compat for existing call sites: buildGallery(page, 'off', 4).
  const optionsObject: GalleryOptions =
    typeof options === 'string'
      ? { snapBehavior: options, count: countArg ?? 3 }
      : options;
  const {
    snapBehavior = 'off',
    count = 3,
    desktopBehavior = 'pinned',
    activation = 'top',
    itemWidth = '80vw',
  } = optionsObject;

  await openPageEditor(page);

  await page.evaluate(
    async attrs => {
      const { createBlock } = window.wp.blocks;
      const slides = Array.from({ length: attrs.count }, (_unused, index) =>
        createBlock('core/group', {}, [
          createBlock('core/heading', { content: `Slide ${index + 1}` }),
        ])
      );
      const gallery = createBlock(
        'aggressive-blocks/horizontal-scroll',
        {
          snapBehavior: attrs.snapBehavior,
          desktopBehavior: attrs.desktopBehavior,
          activation: attrs.activation,
          itemWidth: attrs.itemWidth,
        },
        slides
      );
      window.wp.data.dispatch('core/block-editor').insertBlock(gallery);
      await new Promise(resolve => setTimeout(resolve, 400));
    },
    { snapBehavior, count, desktopBehavior, activation, itemWidth }
  );

  const { id, url } = await publishAndGetUrl(page);
  createdPageId = id;
  return url;
}

/** The keyboard-event fields the guard reads (serialisable to the page). */
type KeyInit = {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

/** Scroll the document without a gesture — as a scrollbar drag, find-in-page,
 * or assistive tech would. */
async function scrollDocumentTo(page: Page, y: number): Promise<void> {
  // Scroll events arrive on the next frame, not with scrollTo(). A gesture
  // sent before then lands first, and the late event from this scroll is
  // then followed as someone else's scroll, cancelling the gesture's step.
  await page.evaluate(
    top =>
      new Promise<void>(resolve => {
        const settle = () => requestAnimationFrame(() => resolve());
        const max = document.documentElement.scrollHeight - window.innerHeight;
        // Past the end the browser clamps, so compare with where it will land.
        if (Math.abs(window.scrollY - Math.min(Math.max(top, 0), max)) < 1) {
          settle();
          return;
        }
        window.addEventListener('scroll', settle, { once: true });
        window.scrollTo(0, top);
      }),
    y
  );
}

/** The gallery's scroll distance (px of vertical scroll the pin consumes). */
function scrollDistance(section: Locator): Promise<number> {
  return section.evaluate(el =>
    parseFloat(el.style.getPropertyValue('--aa-hscroll-distance'))
  );
}

/** Press Tab from the top of the page until focus enters the gallery. */
async function tabIntoGallery(
  page: Page,
  section: Locator
): Promise<string | null> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await section.evaluate(el => {
      const active = document.activeElement;
      if (!active || !el.contains(active)) return null;
      return active.className;
    });
    if (focused) return focused;
  }
  return null;
}

/** Current horizontal translate (px) of the track, negative = moved left. */
function trackTranslateX(page: Page): Promise<number> {
  return page
    .locator('.aa-hscroll__track')
    .first()
    .evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
}

/** Absolute document scroll position of the sticky range's top. */
/**
 * Document top of the pinned range, once layout has settled.
 *
 * The step controller only takes input within RANGE_SLACK_PX (4px) of the
 * range, and data-aa-hscroll-step-state="ready" does not mean it is in range.
 * On a cold CI runner the theme's web fonts can finish loading after a first
 * measurement and push the range down, so scrolling to that stale top lands
 * above it and the first gesture is ignored. Wait for fonts, then for two
 * equal measurements in a row.
 */
async function rangeTop(page: Page): Promise<number> {
  const range = page.locator('.aa-hscroll__range').first();
  const measure = (): Promise<number> =>
    range.evaluate(el => el.getBoundingClientRect().top + window.scrollY);

  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  let previous = await measure();
  await expect
    .poll(
      async () => {
        const current = await measure();
        const settled = current === previous;
        previous = current;
        return settled;
      },
      { intervals: [50] }
    )
    .toBe(true);

  return previous;
}

let createdPageId = 0;

test.describe('Horizontal Scroll — front end', () => {
  test.beforeEach(async ({ page }) => {
    // Desktop, fine pointer → the block enters an enhanced pinned mode.
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test.afterEach(async ({ page }) => {
    await deletePage(page, createdPageId);
    createdPageId = 0;
  });

  test(
    'scrub mode maps the track position to scroll, both directions',
    { tag: '@webkit' },
    async ({ page }) => {
      const url = await buildGallery(page, 'off', 4);
      await page.goto(url);

      const section = page.locator('.aa-hscroll').first();
      await section.waitFor();
      // The runtime upgrades the section to the pinned/enhanced mode on desktop.
      await expect(section).toHaveClass(/is-enhanced/);

      const top = await rangeTop(page);

      // At the top of the range the track sits at its start.
      await scrollDocumentTo(page, top);
      await page.waitForTimeout(120);
      const atStart = await trackTranslateX(page);
      expect(Math.abs(atStart)).toBeLessThan(2);

      // Scrolling deeper into the range moves the track to the left (negative X).
      await page.evaluate(y => window.scrollTo(0, y), top + 1200);
      await page.waitForTimeout(120);
      const scrolledIn = await trackTranslateX(page);
      expect(scrolledIn).toBeLessThan(-10);

      // Scrolling back up returns it toward the start — the map is reversible.
      await scrollDocumentTo(page, top);
      await page.waitForTimeout(120);
      const backAtStart = await trackTranslateX(page);
      expect(Math.abs(backAtStart)).toBeLessThan(Math.abs(scrolledIn));
      expect(Math.abs(backAtStart)).toBeLessThan(2);
    }
  );

  test('snap mode advances one slide per scroll gesture, both directions', async ({
    page,
  }) => {
    const url = await buildGallery(page, 'paged', 4);
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    await section.waitFor();
    await expect(section).toHaveClass(/is-paged/);

    const live = page.locator('.aa-hscroll__live-region');
    const top = await rangeTop(page);
    await scrollDocumentTo(page, top);
    // Entry seats quietly (no live-region spam); readiness is the signal.
    await expect(section).toHaveAttribute(
      'data-aa-hscroll-step-state',
      'ready',
      { timeout: 3000 }
    );

    await page.mouse.move(640, 400);

    await page.mouse.wheel(0, 140);
    await expect(live).toHaveText(/Slide 2 of 4/, { timeout: 3000 });
    await expect(section).toHaveAttribute(
      'data-aa-hscroll-step-state',
      'ready'
    );

    await page.mouse.wheel(0, -140);
    await expect(live).toHaveText(/Slide 1 of 4/, { timeout: 3000 });
  });

  test('arrow keys page slides without revealing side controls', async ({
    page,
  }) => {
    const url = await buildGallery(page, 'paged', 3);
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    const live = page.locator('.aa-hscroll__live-region');
    const next = section.locator('.aa-hscroll__control--next');
    const top = await rangeTop(page);

    await scrollDocumentTo(page, top);
    await expect(section).toHaveAttribute(
      'data-aa-hscroll-step-state',
      'ready',
      { timeout: 3000 }
    );
    await expect(next).toHaveCSS('opacity', '0');

    await page.keyboard.press('ArrowDown');
    await expect(live).toHaveText(/Slide 2 of 3/, { timeout: 3000 });
    await expect(next).toHaveCSS('opacity', '0');
    await expect(section).not.toHaveAttribute('data-aa-hscroll-keyboard', '');

    await page.keyboard.press('ArrowDown');
    await expect(live).toHaveText(/Slide 3 of 3/, { timeout: 3000 });

    await page.keyboard.press('ArrowUp');
    await expect(live).toHaveText(/Slide 2 of 3/, { timeout: 3000 });
  });

  test('exit at the last slide releases page scroll', async ({ page }) => {
    const url = await buildGallery(page, 'paged', 2);
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    const live = page.locator('.aa-hscroll__live-region');
    const top = await rangeTop(page);

    await scrollDocumentTo(page, top);
    await expect(section).toHaveAttribute(
      'data-aa-hscroll-step-state',
      'ready',
      { timeout: 3000 }
    );

    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 140);
    await expect(live).toHaveText(/Slide 2 of 2/, { timeout: 3000 });
    await expect(section).toHaveAttribute(
      'data-aa-hscroll-step-state',
      'ready'
    );

    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(before);
  });

  test(
    'narrow / coarse pointer falls back to native snap carousel',
    { tag: '@webkit' },
    async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const url = await buildGallery(page, {
        snapBehavior: 'off',
        count: 3,
        itemWidth: '85vw',
      });
      await page.goto(url);

      const section = page.locator('.aa-hscroll').first();
      await section.waitFor();
      await expect(section).toHaveClass(/is-snap/);
      await expect(section).not.toHaveClass(/is-enhanced/);
    }
  );

  test('activation center applies the center modifier class', async ({
    page,
  }) => {
    const url = await buildGallery(page, {
      snapBehavior: 'off',
      count: 3,
      activation: 'center',
    });
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    await section.waitFor();
    await expect(section).toHaveClass(/aa-hscroll--center/);
    await expect(section).toHaveClass(/is-enhanced/);
  });

  test('inline desktop behavior pins and scrubs continuously', async ({
    page,
  }) => {
    const url = await buildGallery(page, {
      desktopBehavior: 'inline',
      count: 3,
    });
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    await section.waitFor();
    await expect(section).toHaveClass(/aa-hscroll--inline/);
    await expect(section).toHaveClass(/is-enhanced/);
    await expect(section).not.toHaveClass(/is-paged/);
  });

  test(
    'prev/next controls appear for keyboard users and advance slides',
    { tag: '@webkit' },
    async ({ page }) => {
      const url = await buildGallery(page, 'paged', 3);
      await page.goto(url);

      const section = page.locator('.aa-hscroll').first();
      await section.waitFor();
      const stage = section.locator('.aa-hscroll__stage');
      const viewport = section.locator('.aa-hscroll__viewport');
      await expect(stage).toHaveAttribute('role', 'region');
      await expect(stage).toHaveAttribute('aria-roledescription', 'carousel');

      const prev = section.locator('.aa-hscroll__control--prev');
      const next = section.locator('.aa-hscroll__control--next');
      const live = page.locator('.aa-hscroll__live-region');

      const top = await rangeTop(page);
      await scrollDocumentTo(page, top);
      await expect(section).toHaveAttribute(
        'data-aa-hscroll-step-state',
        'ready',
        { timeout: 3000 }
      );

      await expect(next).toHaveCSS('opacity', '0');

      // Tabbing in lands on Prev. It is disabled on slide 1 but stays a tab
      // stop (aria-disabled), so the controls never drop out from under focus.
      expect(await tabIntoGallery(page, section)).toContain(
        'aa-hscroll__control--prev'
      );
      await expect(section).toHaveAttribute('data-aa-hscroll-keyboard', '');
      await expect(prev).toBeDisabled();
      await page.keyboard.press('Tab');
      await expect(next).toBeFocused();
      await expect(next).toHaveCSS('opacity', '1');
      await expect(next).toBeEnabled();

      await next.click();
      await expect(live).toHaveText(/Slide 2 of 3/, { timeout: 3000 });
      await expect(section).toHaveAttribute(
        'data-aa-hscroll-step-state',
        'ready'
      );
      await expect(prev).toBeEnabled();

      // After advance, Tab order is still Prev before Next, then the viewport.
      await viewport.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(next).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(prev).toBeFocused();

      // Pressing Next onto the last slide disables it without dropping focus
      // to the page; pressing it again does nothing.
      await next.focus();
      await page.keyboard.press('Enter');
      await expect(live).toHaveText(/Slide 3 of 3/, { timeout: 3000 });
      await expect(next).toBeDisabled();
      await expect(next).toBeFocused();
      await expect(section).toHaveAttribute(
        'data-aa-hscroll-step-state',
        'ready'
      );
      const settledY = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Enter');
      await expect(next).toBeFocused();
      expect(await page.evaluate(() => window.scrollY)).toBe(settledY);

      await prev.click();
      await expect(live).toHaveText(/Slide 2 of 3/, { timeout: 3000 });
    }
  );

  test('paged mode follows scrolling it did not start instead of trapping it', async ({
    page,
  }) => {
    const url = await buildGallery(page, 'paged', 4);
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    await expect(section).toHaveClass(/is-paged/);
    const top = await rangeTop(page);
    const distance = await scrollDistance(section);

    await scrollDocumentTo(page, top);
    await expect(section).toHaveAttribute(
      'data-aa-hscroll-step-state',
      'ready',
      { timeout: 3000 }
    );

    // A scrollbar drag through the range: every position must stick. The
    // controller used to clamp each one back to the settled slide.
    for (const fraction of [0.2, 0.45, 0.7]) {
      const y = Math.round(top + distance * fraction);
      await scrollDocumentTo(page, y);
      await page.waitForTimeout(150);
      expect(
        Math.abs((await page.evaluate(() => window.scrollY)) - y)
      ).toBeLessThan(3);
    }
  });

  test('Space and Shift+Space page slides in paged mode', async ({ page }) => {
    const url = await buildGallery(page, 'paged', 3);
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    const live = page.locator('.aa-hscroll__live-region');
    await scrollDocumentTo(page, await rangeTop(page));
    await expect(section).toHaveAttribute(
      'data-aa-hscroll-step-state',
      'ready',
      { timeout: 3000 }
    );

    await page.keyboard.press('Space');
    await expect(live).toHaveText(/Slide 2 of 3/, { timeout: 3000 });
    await page.keyboard.press('Shift+Space');
    await expect(live).toHaveText(/Slide 1 of 3/, { timeout: 3000 });
  });

  test('page-level keys stay with the browser unless they are paging keys', async ({
    page,
  }) => {
    const url = await buildGallery(page, 'paged', 3);
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    await scrollDocumentTo(page, await rangeTop(page));
    await expect(section).toHaveAttribute(
      'data-aa-hscroll-step-state',
      'ready',
      { timeout: 3000 }
    );

    // Synthetic events: a real Alt+ArrowLeft would navigate Back mid-test.
    // What matters is whether the gallery's window listener cancels them.
    const prevented = (init: KeyInit) =>
      page.evaluate(options => {
        const event = new KeyboardEvent('keydown', {
          ...options,
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
      }, init);

    // Control: a plain paging key inside the range is the gallery's.
    expect(await prevented({ key: 'ArrowDown' })).toBe(true);
    await expect(page.locator('.aa-hscroll__live-region')).toHaveText(
      /Slide 2 of 3/,
      { timeout: 3000 }
    );
    await expect(section).toHaveAttribute(
      'data-aa-hscroll-step-state',
      'ready'
    );

    // Alt+Arrow is browser Back / Forward; Shift+Arrow extends a selection;
    // Ctrl/Cmd combinations are browser and OS shortcuts.
    expect(await prevented({ key: 'ArrowLeft', altKey: true })).toBe(false);
    expect(await prevented({ key: 'ArrowDown', shiftKey: true })).toBe(false);
    expect(await prevented({ key: 'Home', ctrlKey: true })).toBe(false);
    expect(await prevented({ key: 'ArrowDown', metaKey: true })).toBe(false);

    // Home / End jump the page unless focus is inside the gallery.
    expect(await prevented({ key: 'End' })).toBe(false);
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('End');
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(before + 100);
  });

  test(
    'tabbing in starts at the first slide, not mid-gallery',
    { tag: '@webkit' },
    async ({ page }) => {
      const url = await buildGallery(page, 'off', 5);
      await page.goto(url);

      const section = page.locator('.aa-hscroll').first();
      await expect(section).toHaveClass(/is-enhanced/);
      const top = await rangeTop(page);

      const focused = await tabIntoGallery(page, section);
      expect(focused).not.toBeNull();
      // Focusing a gallery stop never scrolls the page past the start of the
      // range. (It may not scroll at all when the gallery is already on
      // screen.) The old tab stop was the whole-range section, which browsers
      // centred — landing about halfway through the gallery.
      expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(
        top + 2
      );
      await expect(section.locator('.aa-hscroll__progress')).toHaveAttribute(
        'aria-valuenow',
        '0'
      );
    }
  );

  test('keyboard "next" from between slides goes to the slide ahead', async ({
    page,
  }) => {
    const url = await buildGallery(page, 'off', 5);
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    const live = page.locator('.aa-hscroll__live-region');
    const top = await rangeTop(page);
    const distance = await scrollDistance(section);

    // Between slide 1 (0) and slide 2 (~25%), nearer slide 2.
    await scrollDocumentTo(page, Math.round(top + distance * 0.16));
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    await expect(live).toHaveText(/Slide 2 of 5/, { timeout: 3000 });
  });

  test('scrubbing leaves the track to the compositor where supported', async ({
    page,
  }) => {
    const url = await buildGallery(page, 'off', 4);
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    await expect(section).toHaveClass(/is-enhanced/);
    const supported = await page.evaluate(() =>
      CSS.supports('animation-timeline: scroll()')
    );
    test.skip(!supported, 'Browser lacks scroll-driven animations');

    const track = section.locator('.aa-hscroll__track');
    await expect(track).toHaveCSS('animation-name', 'aa-hscroll-scrub');
    await expect(section.locator('.aa-hscroll__progress-bar')).toHaveCSS(
      'animation-name',
      'aa-hscroll-progress'
    );

    const top = await rangeTop(page);
    await scrollDocumentTo(page, top + 600);
    await page.waitForTimeout(150);
    expect(await trackTranslateX(page)).toBeLessThan(-10);
    // No per-frame JS transform on the section; the progress value still moves.
    expect(
      await section.evaluate(el => el.style.getPropertyValue('--aa-hscroll-x'))
    ).toBe('');
    await expect(section.locator('.aa-hscroll__progress')).not.toHaveAttribute(
      'aria-valuenow',
      '0'
    );
  });

  test('a mouse in a narrow or zoomed window gets visible, stationary controls', async ({
    page,
  }) => {
    // 200% zoom on a 1280px laptop ≈ 640 CSS px, still a fine pointer.
    await page.setViewportSize({ width: 640, height: 480 });
    const url = await buildGallery(page, {
      snapBehavior: 'off',
      count: 4,
      itemWidth: '85vw',
    });
    await page.goto(url);

    const section = page.locator('.aa-hscroll').first();
    await expect(section).toHaveClass(/is-snap/);
    await section.scrollIntoViewIfNeeded();

    const next = section.locator('.aa-hscroll__control--next');
    await expect(next).toHaveCSS('opacity', '1');
    await expect(section.locator('.aa-hscroll__swipe-hint')).not.toBeVisible();

    const nextX = async () => (await next.boundingBox())?.x ?? 0;
    const before = await nextX();
    await next.click();
    await expect(page.locator('.aa-hscroll__live-region')).toHaveText(
      /Slide 2 of 4/,
      { timeout: 3000 }
    );
    await page.waitForTimeout(600);
    // The controls overlay the stage, not the scrolling viewport.
    expect(Math.abs((await nextX()) - before)).toBeLessThan(2);
  });

  test('the touch carousel announces the slide a swipe settles on', async ({
    page,
    browser,
  }) => {
    const url = await buildGallery(page, {
      snapBehavior: 'off',
      count: 4,
      itemWidth: '85vw',
    });

    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const mobile = await context.newPage();
    try {
      await mobile.goto(url);
      const section = mobile.locator('.aa-hscroll').first();
      await expect(section).toHaveClass(/is-snap/);
      await section.scrollIntoViewIfNeeded();

      await section
        .locator('.aa-hscroll__viewport')
        .evaluate(viewport =>
          viewport.scrollBy({ left: viewport.clientWidth, behavior: 'smooth' })
        );
      await expect(mobile.locator('.aa-hscroll__live-region')).toHaveText(
        /Slide 2 of 4/,
        { timeout: 3000 }
      );
    } finally {
      await context.close();
    }
  });
});
