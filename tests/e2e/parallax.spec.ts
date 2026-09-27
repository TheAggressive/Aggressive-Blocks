import { test, expect, devices, type Page } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

const TIMELINE_CLASS = /aggressive-apparel-parallax--scroll-timeline/;

/**
 * Build a tall parallax section (one depth-40 paragraph layer followed
 * by a 2400px spacer) between two viewport-height spacers, and publish.
 */
async function publishTallSection(
  page: Page,
  parallaxAttributes: Record<string, unknown> = {}
): Promise<{ id: number; url: string }> {
  await openPageEditor(page);
  await page.evaluate(async attributes => {
    const { createBlock } = window.wp.blocks;
    const layer = createBlock('core/paragraph', {
      content: 'Tall section layer',
      aggressiveApparelParallax: {
        enabled: true,
        speed: 1,
        direction: 'down',
        delay: 0,
        easing: 'linear',
        depth: 40,
      },
    });
    const filler = createBlock('core/spacer', { height: '2400px' });
    const parallax = createBlock(
      'aggressive-blocks/parallax',
      { intensity: 80, visibilityTrigger: 0.3, ...attributes },
      [layer, filler]
    );
    window.wp.data
      .dispatch('core/block-editor')
      .insertBlocks([
        createBlock('core/spacer', { height: '100vh' }),
        parallax,
        createBlock('core/spacer', { height: '100vh' }),
      ]);
    await new Promise(r => setTimeout(r, 400));
  }, parallaxAttributes);
  return publishAndGetUrl(page);
}

/**
 * Scroll so the parallax root's bottom edge sits at `bottomFraction` of
 * the viewport height, let both renderers settle, and read the layer's
 * computed translate Y.
 */
async function layerYWhenBottomAt(
  page: Page,
  bottomFraction: number
): Promise<number> {
  return page.evaluate(async fraction => {
    const root = document.querySelector<HTMLElement>(
      '.aggressive-apparel-parallax'
    )!;
    const layer = root.querySelector<HTMLElement>(
      '[data-parallax-enabled="true"]'
    )!;
    const rect = root.getBoundingClientRect();
    const target = window.scrollY + rect.bottom - window.innerHeight * fraction;
    window.scrollTo({ top: target, behavior: 'instant' });
    for (let i = 0; i < 3; i++) {
      await new Promise(r => requestAnimationFrame(r));
    }
    const [, y = '0px'] = getComputedStyle(layer).translate.split(' ');
    return parseFloat(y);
  }, bottomFraction);
}

/**
 * Publish one parallax block holding a single linked paragraph layer,
 * placed below a half-viewport spacer so it starts on screen.
 */
async function publishLinkLayer(
  page: Page,
  parallaxAttributes: Record<string, unknown>,
  layerSettings: Record<string, unknown> = {}
): Promise<{ id: number; url: string }> {
  await openPageEditor(page);
  await page.evaluate(
    async ({ attributes, settings }) => {
      const { createBlock } = window.wp.blocks;
      const layer = createBlock('core/paragraph', {
        content: '<a href="#layer-target">Layer link</a>',
        aggressiveApparelParallax: {
          enabled: true,
          speed: 1,
          direction: 'down',
          delay: 0,
          easing: 'linear',
          depth: 60,
          ...settings,
        },
      });
      window.wp.data
        .dispatch('core/block-editor')
        .insertBlocks([
          createBlock('core/spacer', { height: '30vh' }),
          createBlock(
            'aggressive-blocks/parallax',
            { intensity: 60, ...attributes },
            [layer]
          ),
          createBlock('core/spacer', { height: '150vh' }),
        ]);
      await new Promise(r => setTimeout(r, 400));
    },
    { attributes: parallaxAttributes, settings: layerSettings }
  );
  return publishAndGetUrl(page);
}

/** Wait a few frames, then read the layer's computed translate as [x, y]. */
async function readLayerTranslate(page: Page): Promise<[number, number]> {
  return page.evaluate(async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise(r => requestAnimationFrame(r));
    }
    const layer = document.querySelector<HTMLElement>(
      '.aggressive-apparel-parallax [data-parallax-enabled="true"]'
    )!;
    const value = getComputedStyle(layer).translate;
    if (value === 'none') {
      return [0, 0];
    }
    const [x = '0', y = '0'] = value.split(' ');
    return [parseFloat(x), parseFloat(y)];
  });
}

test.describe('Parallax — front end', () => {
  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('applies layer translate on scroll and keeps links clickable', async ({
    page,
  }) => {
    await openPageEditor(page);

    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const layer = createBlock('core/paragraph', {
        content:
          '<a href="https://example.com/parallax-link">Parallax link</a>',
        aggressiveApparelParallax: {
          enabled: true,
          speed: 1,
          direction: 'down',
          delay: 0,
          easing: 'linear',
          depth: 40,
        },
      });
      const parallax = createBlock(
        'aggressive-blocks/parallax',
        {
          intensity: 80,
          visibilityTrigger: 0,
          detectionBoundary: {
            top: '0%',
            right: '0%',
            bottom: '0%',
            left: '0%',
          },
          activationBuffer: 0,
          enableMouseInteraction: false,
          disableOnMobile: false,
        },
        [layer]
      );
      const spacer = createBlock('core/spacer', { height: '120vh' });
      window.wp.data
        .dispatch('core/block-editor')
        .insertBlocks([spacer, parallax, spacer]);
      await new Promise(r => setTimeout(r, 400));
    });

    const { id, url } = await publishAndGetUrl(page);
    pageId = id;

    await page.goto(url);
    const root = page.locator('.aggressive-apparel-parallax').first();
    await root.waitFor();
    await expect(root).not.toHaveClass(/disable-on-mobile/);
    // Chromium supports scroll-driven animations: the native renderer
    // runs the layers, with no per-frame JavaScript.
    await expect(root).toHaveClass(TIMELINE_CLASS);

    const layer = root.locator('[data-parallax-enabled="true"]').first();
    await expect(layer).toHaveCount(1);

    await layer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const before = await layer.evaluate(
      el => getComputedStyle(el as HTMLElement).translate
    );

    await page.evaluate(() => window.scrollBy(0, 240));

    // Parallax updates `translate` on requestAnimationFrame after the scroll,
    // and the frame-engine warm-up time is variable — a fixed delay was the
    // source of intermittent flakes. Poll until the value actually changes.
    await expect
      .poll(
        () =>
          layer.evaluate(el => getComputedStyle(el as HTMLElement).translate),
        { timeout: 5000 }
      )
      .not.toBe(before);

    const link = layer.locator('a');
    await expect(link).toBeVisible();
    // Hit-testing: the link’s layout box should receive the click target.
    const box = await link.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      const hit = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return el?.closest('a')?.getAttribute('href') ?? null;
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      );
      expect(hit).toBe('https://example.com/parallax-link');
    }
  });

  test('emits disable-on-mobile class when opted in', async ({ page }) => {
    await openPageEditor(page);

    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const layer = createBlock('core/paragraph', {
        content: 'Static on phones',
        aggressiveApparelParallax: {
          enabled: true,
          speed: 1,
          direction: 'down',
          delay: 0,
          easing: 'linear',
          depth: 20,
        },
      });
      const parallax = createBlock(
        'aggressive-blocks/parallax',
        { disableOnMobile: true, intensity: 50 },
        [layer]
      );
      window.wp.data.dispatch('core/block-editor').insertBlock(parallax);
      await new Promise(r => setTimeout(r, 400));
    });

    const { id, url } = await publishAndGetUrl(page);
    pageId = id;

    await page.goto(url);
    const root = page.locator('.aggressive-apparel-parallax').first();
    await expect(root).toHaveClass(/disable-on-mobile/);
  });

  test('keeps a tall section moving while it still covers the screen', async ({
    page,
    browser,
  }) => {
    // Regression: the observer switched sections off at the visibility
    // trigger, freezing a ~3.5-viewport section while it still filled
    // most of the screen. Checked on both renderers — the JS fallback is
    // where the observer gates motion.
    const { id, url } = await publishTallSection(page);
    pageId = id;

    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      delete (window as { ViewTimeline?: unknown }).ViewTimeline;
    });

    for (const target of [page, fallback]) {
      await target.goto(url);
      await expect(target.locator('.aggressive-apparel-parallax')).toHaveClass(
        /initialized/
      );

      const whileCoveringMost = await layerYWhenBottomAt(target, 0.6);
      const whileCoveringLess = await layerYWhenBottomAt(target, 0.3);
      expect(whileCoveringLess).toBeGreaterThan(whileCoveringMost + 1);
    }
    await fallback.close();
  });

  test('native and JS renderers produce the same motion', async ({
    page,
    browser,
  }) => {
    const { id, url } = await publishTallSection(page);
    pageId = id;

    // Force the JS fallback in a second page by hiding ViewTimeline.
    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      delete (window as { ViewTimeline?: unknown }).ViewTimeline;
    });

    await page.goto(url);
    await fallback.goto(url);
    const nativeRoot = page.locator('.aggressive-apparel-parallax');
    const fallbackRoot = fallback.locator('.aggressive-apparel-parallax');
    await expect(nativeRoot).toHaveClass(TIMELINE_CLASS);
    await expect(fallbackRoot).toHaveClass(/initialized/);
    await expect(fallbackRoot).not.toHaveClass(TIMELINE_CLASS);

    for (const fraction of [1.4, 1, 0.75, 0.5, 0.2, -0.1]) {
      const native = await layerYWhenBottomAt(page, fraction);
      const js = await layerYWhenBottomAt(fallback, fraction);
      expect(Math.abs(native - js)).toBeLessThan(1.5);
    }
    await fallback.close();
  });

  test('3D pointer mode stays on the JS renderer', async ({ page }) => {
    const { id, url } = await publishTallSection(page, {
      enableMouseInteraction: true,
    });
    pageId = id;
    await page.goto(url);
    const root = page.locator('.aggressive-apparel-parallax');
    await expect(root).toHaveClass(/initialized/);
    await expect(root).not.toHaveClass(TIMELINE_CLASS);

    const early = await layerYWhenBottomAt(page, 1.2);
    const late = await layerYWhenBottomAt(page, 0.4);
    expect(late).not.toBe(early);
  });

  test('keeps interactive inner blocks intact', async ({ page }) => {
    // Regression: the render ran inner content through wp_kses_post(),
    // stripping the search form and its input.
    await openPageEditor(page);
    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const parallax = createBlock('aggressive-blocks/parallax', {}, [
        createBlock('core/search', { label: 'Search', buttonText: 'Go' }),
      ]);
      window.wp.data.dispatch('core/block-editor').insertBlock(parallax);
      await new Promise(r => setTimeout(r, 400));
    });
    const { id, url } = await publishAndGetUrl(page);
    pageId = id;

    await page.goto(url);
    const root = page.locator('.aggressive-apparel-parallax');
    await expect(root.locator('form[role="search"]')).toHaveCount(1);
    await expect(root.locator('input[type="search"]')).toBeVisible();
  });

  test('honors reduced motion at load and when it changes mid-visit', async ({
    page,
  }) => {
    const { id, url } = await publishTallSection(page);
    pageId = id;

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url);
    const root = page.locator('.aggressive-apparel-parallax');
    await expect(root).toHaveAttribute('data-wp-init', /initParallax/);
    await page.waitForTimeout(300);
    await expect(root).not.toHaveClass(/initialized/);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    // Preference lifted: motion starts.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(root).toHaveClass(/initialized/);
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().length))
      .toBeGreaterThan(0);

    // Turned back on mid-visit: everything stops and layers return home.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(root).not.toHaveClass(/initialized/);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await readLayerTranslate(page)).toEqual([0, 0]);
  });

  test('keeps links clickable under the 3D tilt after pointer motion', async ({
    page,
  }) => {
    const { id, url } = await publishLinkLayer(page, {
      enableMouseInteraction: true,
      maxMouseRotation: 10,
    });
    pageId = id;
    await page.goto(url);
    await expect(page.locator('.aggressive-apparel-parallax')).toHaveClass(
      /initialized/
    );

    // Sweep the pointer so the card tilts and the layer shifts.
    const viewport = page.viewportSize()!;
    await page.mouse.move(viewport.width * 0.9, viewport.height * 0.2, {
      steps: 8,
    });
    const link = page.getByRole('link', { name: 'Layer link' });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector('.aggressive-apparel-parallax__container')!
            ).transform
        )
      )
      .not.toBe('none');

    // A real click at the link's painted center must land on the link.
    await link.click();
    await expect(page).toHaveURL(/#layer-target$/);
  });

  test('pulls a magnetic layer toward the pointer and holds steady', async ({
    page,
  }) => {
    const { id, url } = await publishLinkLayer(
      page,
      { enableMouseInteraction: true, maxMouseTranslation: 0 },
      {
        depth: 0,
        effects: {
          magneticMouse: {
            enabled: true,
            strength: 2,
            range: 600,
            mode: 'attract',
            elastic: false,
          },
        },
      }
    );
    pageId = id;
    await page.goto(url);
    await expect(page.locator('.aggressive-apparel-parallax')).toHaveClass(
      /initialized/
    );

    const [restX] = await readLayerTranslate(page);
    const box = (await page
      .locator('.aggressive-apparel-parallax [data-parallax-enabled]')
      .boundingBox())!;
    // Park the pointer 150px right of the layer's center.
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, {
      steps: 5,
    });
    await page.waitForTimeout(600);

    const settled = await readLayerTranslate(page);
    // Default strength used to cap the pull at 2px; now clearly visible.
    expect(settled[0] - restX).toBeGreaterThan(10);
    // No feedback-loop jitter: the value holds across frames.
    expect(await readLayerTranslate(page)).toEqual(settled);
  });

  test('calibrates device tilt to how the phone is held', async ({
    page,
    browser,
  }) => {
    const { id, url } = await publishLinkLayer(page, {
      enableMouseInteraction: true,
      maxMouseTranslation: 40,
      mouseInfluenceMultiplier: 1,
    });
    pageId = id;

    // A touch-first phone: tilt is the pointer source there.
    const phone = await browser.newContext({ ...devices['Pixel 7'] });
    const mobile = await phone.newPage();
    await mobile.goto(url);
    await expect(mobile.locator('.aggressive-apparel-parallax')).toHaveClass(
      /initialized/
    );

    // WebKit won't construct DeviceOrientationEvent from page script; a
    // plain event carrying beta/gamma drives the same handler everywhere.
    const tilt = (beta: number, gamma: number) =>
      mobile.evaluate(
        ([b, g]) =>
          window.dispatchEvent(
            Object.assign(new Event('deviceorientation'), {
              beta: b,
              gamma: g,
            })
          ),
        [beta, gamma]
      );

    const before = await readLayerTranslate(mobile);
    // Held at a typical 50° reading angle: the scene must stay centered
    // (raw mapping used to pin it at maximum vertical offset).
    await tilt(50, 0);
    await mobile.waitForTimeout(400);
    expect(await readLayerTranslate(mobile)).toEqual(before);

    // Tipping forward from there moves the scene. (Regression: the
    // listener was never attached in browsers exposing requestPermission.)
    // Which screen axis moves depends on the reported screen rotation
    // (unit-tested in screenTilt; WebKit's phone emulation reports 90°).
    await tilt(65, 0);
    await mobile.waitForTimeout(600);
    const tipped = await readLayerTranslate(mobile);
    expect(
      Math.abs(tipped[0] - before[0]) + Math.abs(tipped[1] - before[1])
    ).toBeGreaterThan(5);
    await phone.close();
  });
});
