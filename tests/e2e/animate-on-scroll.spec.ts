import { test, expect } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

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
      const sample = () => {
        const child = document.querySelector('.wp-block-animate-on-scroll > *');
        if (child) {
          const opacity = Number(getComputedStyle(child).opacity);
          if (state.trace.at(-1) !== opacity) state.trace.push(opacity);
        }
        if (performance.now() < 4000) requestAnimationFrame(sample);
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
});
