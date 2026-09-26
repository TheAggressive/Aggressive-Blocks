import { test, expect, type Page } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

/**
 * Publish a page with one block far below the fold (a tall spacer first),
 * holding a paragraph and a link, and open it once the store has armed it.
 */
async function publishBelowFold(
  page: Page,
  attributes: Record<string, unknown>
): Promise<number> {
  await openPageEditor(page);

  await page.evaluate(async attrs => {
    const { createBlock } = window.wp.blocks;
    window.wp.data.dispatch('core/block-editor').insertBlocks([
      createBlock('core/spacer', { height: '2400px' }),
      createBlock('aggressive-blocks/animate-on-scroll', attrs, [
        createBlock('core/paragraph', { content: 'Below the fold' }),
        createBlock('core/paragraph', {
          content: '<a href="https://example.com/">Below the fold link</a>',
        }),
      ]),
    ]);
    await new Promise(r => setTimeout(r, 400));
  }, attributes);

  const { id, url } = await publishAndGetUrl(page);
  await page.goto(url);
  await page
    .locator('.wp-block-animate-on-scroll[data-animate-id]')
    .first()
    .waitFor();
  return id;
}

test.describe('Animate On Scroll — front end', () => {
  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('staggers child transition-delay after becoming visible', async ({
    page,
  }) => {
    await openPageEditor(page);

    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const aos = createBlock(
        'aggressive-blocks/animate-on-scroll',
        {
          animation: 'fade',
          staggerChildren: true,
          staggerDelay: 0.2,
          duration: 0.4,
          initialDelay: 0,
          threshold: '0',
          detectionBoundary: {
            top: '0%',
            right: '0%',
            bottom: '0%',
            left: '0%',
          },
          respectReducedMotion: false,
        },
        [
          createBlock('core/paragraph', { content: 'Child A' }),
          createBlock('core/paragraph', { content: 'Child B' }),
          createBlock('core/paragraph', { content: 'Child C' }),
        ]
      );
      window.wp.data.dispatch('core/block-editor').insertBlock(aos);
      await new Promise(r => setTimeout(r, 400));
    });

    const { id, url } = await publishAndGetUrl(page);
    pageId = id;

    await page.goto(url);
    const root = page.locator('.wp-block-animate-on-scroll').first();
    await root.waitFor();
    await expect(root).toHaveAttribute('data-stagger-children', 'true');
    await expect(root).toHaveClass(/is-visible/, { timeout: 10_000 });

    const delays = await root.evaluate(el =>
      Array.from(el.children).map(
        child => getComputedStyle(child as HTMLElement).transitionDelay
      )
    );

    expect(delays).toHaveLength(3);
    expect(parseFloat(delays[0])).toBeCloseTo(0, 2);
    expect(parseFloat(delays[1])).toBeCloseTo(0.2, 2);
    expect(parseFloat(delays[2])).toBeCloseTo(0.4, 2);
  });

  test('sequence bounce runs keyframes without transform !important lock', async ({
    page,
  }) => {
    await openPageEditor(page);

    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const aos = createBlock(
        'aggressive-blocks/animate-on-scroll',
        {
          useSequence: true,
          animationSequence: [
            { animation: 'bounce', direction: 'standard' },
            { animation: 'fade', direction: '' },
          ],
          staggerChildren: true,
          staggerDelay: 0.15,
          duration: 0.6,
          initialDelay: 0,
          threshold: '0',
          detectionBoundary: {
            top: '0%',
            right: '0%',
            bottom: '0%',
            left: '0%',
          },
          respectReducedMotion: false,
        },
        [
          createBlock('core/paragraph', { content: 'Bounce me' }),
          createBlock('core/paragraph', { content: 'Fade me' }),
        ]
      );
      window.wp.data.dispatch('core/block-editor').insertBlock(aos);
      await new Promise(r => setTimeout(r, 400));
    });

    const { id, url } = await publishAndGetUrl(page);
    pageId = id;

    // The entrance starts on first paint; record it as it starts.
    await page.addInitScript(() => {
      const started: string[] = [];
      (window as unknown as { bounceStarts: string[] }).bounceStarts = started;
      document.addEventListener(
        'animationstart',
        event => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.matches('[data-animate-sequence-type="bounce"]')
          ) {
            started.push(event.animationName);
          }
        },
        true
      );
    });

    await page.goto(url);
    const root = page.locator('.wp-block-animate-on-scroll').first();
    await root.waitFor();
    await expect(root).toHaveClass(/has-animation-sequence/);
    await expect(root).toHaveClass(/is-visible/, { timeout: 10_000 });

    const bounceWrap = root.locator('[data-animate-sequence-type="bounce"]');
    await expect(bounceWrap).toHaveCount(1);

    // The bounce keyframes ran.
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { bounceStarts: string[] }).bounceStarts
        )
      )
      .toContain('bounce-in');

    // A stuck `transform: none !important` would beat any animation of
    // transform, so drive one directly (paused, timing-independent).
    const probed = await bounceWrap.evaluate(el => {
      const probe = el.animate(
        [{ transform: 'translateY(30px)' }, { transform: 'none' }],
        { duration: 1000 }
      );
      probe.pause();
      const transform = getComputedStyle(el).transform;
      probe.cancel();
      return transform;
    });
    expect(probed).toBe('matrix(1, 0, 0, 1, 0, 30)');

    // Settled on none, not an identity matrix that would trap fixed content.
    await expect
      .poll(() => bounceWrap.evaluate(el => getComputedStyle(el).transform), {
        timeout: 5_000,
      })
      .toBe('none');
  });

  test('an in-view block animates in on first paint, without the view script', async ({
    page,
  }) => {
    await openPageEditor(page);

    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const aos = createBlock(
        'aggressive-blocks/animate-on-scroll',
        { animation: 'fade', duration: 0.4, respectReducedMotion: false },
        [createBlock('core/paragraph', { content: 'In view at load' })]
      );
      window.wp.data.dispatch('core/block-editor').insertBlock(aos, 0);
      await new Promise(r => setTimeout(r, 400));
    });

    const { id, url } = await publishAndGetUrl(page);
    pageId = id;

    // The entrance is CSS only: block the store's script entirely.
    await page.route(/animate-on-scroll\/view\.js/, route => route.abort());

    // Record the entrance: every opacity change from the first frame, and
    // the opacity transitions the CSS starts on the child.
    await page.addInitScript(() => {
      const state = { trace: [] as number[], transitions: 0 };
      (window as unknown as { aos: typeof state }).aos = state;
      document.addEventListener(
        'transitionrun',
        event => {
          const target = event.target;
          if (
            event.propertyName === 'opacity' &&
            target instanceof Element &&
            target.parentElement?.matches('.wp-block-animate-on-scroll')
          ) {
            state.transitions++;
          }
        },
        true
      );
      // Sample for 4s from the first frame, not from navigation start: a
      // slow server can take most of that before the page first paints.
      let until = 0;
      const sample = (now: number) => {
        until ||= now + 4000;
        const child = document.querySelector('.wp-block-animate-on-scroll > *');
        if (child) {
          const opacity = Number(getComputedStyle(child).opacity);
          if (state.trace.at(-1) !== opacity) state.trace.push(opacity);
        }
        if (now < until) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await page.goto(url);
    await page.waitForTimeout(1500);

    const root = page.locator('.wp-block-animate-on-scroll').first();
    await expect(root).not.toHaveAttribute('data-animate-id');

    const { trace, transitions } = await page.evaluate(
      () =>
        (window as unknown as { aos: { trace: number[]; transitions: number } })
          .aos
    );
    // The CSS entrance ran with the store's script blocked. Whether the
    // first sampled frame catches it mid-flight depends on how soon the
    // runner presents that frame, so the event, not the first sample,
    // proves it.
    expect(transitions).toBeGreaterThan(0);
    // Never shown, hidden, and shown again: opacity only rises, to 1.
    expect(trace.at(-1)).toBe(1);
    trace.slice(1).forEach((opacity, i) => {
      expect(opacity).toBeGreaterThanOrEqual(trace[i]);
    });
  });

  test('keyboard focus reveals an armed block', async ({ page }) => {
    pageId = await publishBelowFold(page, { animation: 'slide' });
    const root = page.locator('.wp-block-animate-on-scroll').first();

    // No scroll, so only the focus can reveal it.
    await page
      .getByRole('link', { name: 'Below the fold link' })
      .evaluate(link => (link as HTMLElement).focus({ preventScroll: true }));

    await expect(root).toHaveClass(/is-visible/);
  });

  test('a block at the end of the page is revealed there', async ({ page }) => {
    pageId = await publishBelowFold(page, { animation: 'fade' });
    const root = page.locator('.wp-block-animate-on-scroll').first();

    // Put the block flush against the bottom of the page, inside the
    // boundary's -25% bottom inset, where its trigger can never be reached.
    await page.addStyleTag({
      content:
        'footer, .wp-block-template-part:has(footer) { display: none !important; } body * { margin-bottom: 0 !important; padding-bottom: 0 !important; }',
    });
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    );

    await expect(root).toHaveClass(/is-visible/);
    const bottom = await root.evaluate(el => el.getBoundingClientRect().bottom);
    const viewport = page.viewportSize()!.height;
    expect(bottom).toBeGreaterThan(viewport * 0.75);
  });

  test('reduced motion without the respect option fades without moving', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    pageId = await publishBelowFold(page, {
      animation: 'slide',
      direction: 'up',
      respectReducedMotion: false,
    });
    const root = page.locator('.wp-block-animate-on-scroll').first();
    const child = root.locator('> p').first();

    // Armed: hidden, not offset, and not clickable.
    await expect(child).toHaveCSS('opacity', '0');
    await expect(child).toHaveCSS('transform', 'none');
    await expect(child).toHaveCSS('pointer-events', 'none');

    await root.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await expect(root).toHaveClass(/is-visible/);
    await expect(child).toHaveCSS('opacity', '1');
    await expect(child).toHaveCSS('transform', 'none');
  });
});
