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

  test('editor preview assigns sequence steps and stagger to individual blocks', async ({
    page,
  }) => {
    await openPageEditor(page);
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
    pageId = await page.evaluate(() =>
      Number(window.wp.data.select('core/editor').getCurrentPostId())
    );
    await page.evaluate(() => {
      const { createBlock } = window.wp.blocks;
      const aos = createBlock(
        'aggressive-blocks/animate-on-scroll',
        {
          useSequence: true,
          animationSequence: [
            { animation: 'slide', direction: 'left' },
            { animation: 'bounce', direction: 'standard' },
          ],
          staggerChildren: true,
          staggerDelay: 0.2,
          duration: 2,
        },
        [
          createBlock('core/paragraph', { content: 'First preview child' }),
          createBlock('core/paragraph', { content: 'Second preview child' }),
        ]
      );
      const editor = window.wp.data.dispatch('core/block-editor');
      editor.insertBlock(aos);
      editor.selectBlock(aos.clientId);
      window.wp.data
        .dispatch('core/interface')
        .enableComplementaryArea('core', 'edit-post/block');
    });
    const root = page
      .frameLocator('iframe[name="editor-canvas"]')
      .locator('.wp-block-animate-on-scroll')
      .first();
    await expect(root.locator('> p')).toHaveCount(2);
    await page
      .getByRole('button', { name: 'Preview animation', exact: true })
      .click();
    const children = root.locator('> p');
    await expect(children.nth(0)).toHaveAttribute(
      'data-animate-sequence-type',
      'slide'
    );
    await expect(children.nth(1)).toHaveAttribute(
      'data-animate-sequence-type',
      'bounce'
    );
    await expect(children.nth(0)).toHaveCSS('transition-delay', '0s');
    await expect(children.nth(1)).toHaveCSS('transition-delay', '0.2s');
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

    // Record the entrance when the observer reveals the block.
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

  test('content stays visible without the view script and does not animate early', async ({
    page,
  }) => {
    await openPageEditor(page);
    await page.evaluate(() => {
      const { createBlock } = window.wp.blocks;
      window.wp.data
        .dispatch('core/block-editor')
        .insertBlock(
          createBlock(
            'aggressive-blocks/animate-on-scroll',
            { animation: 'bounce', duration: 0.4, respectReducedMotion: false },
            [createBlock('core/paragraph', { content: 'In view at load' })]
          ),
          0
        );
    });
    const { id, url } = await publishAndGetUrl(page);
    pageId = id;
    await page.route(/animate-on-scroll\/view\.js/, route => route.abort());
    await page.goto(url);
    const root = page.locator('.wp-block-animate-on-scroll').first();
    await expect(root).not.toHaveAttribute('data-animate-id');
    await expect(root.locator('> p')).toHaveCSS('opacity', '1');
    await expect(root.locator('> p')).toHaveCSS('animation-name', 'none');
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

  test('sequence children keep the layout rules for aligned blocks', async ({
    page,
  }) => {
    await openPageEditor(page);

    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      const aos = createBlock(
        'aggressive-blocks/animate-on-scroll',
        {
          useSequence: true,
          animationSequence: [{ animation: 'fade' }],
          respectReducedMotion: false,
        },
        [
          createBlock('core/image', {
            url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
            alt: 'Aligned',
            align: 'left',
            width: '120px',
          }),
          createBlock('core/paragraph', { content: 'Text beside the image' }),
        ]
      );
      window.wp.data.dispatch('core/block-editor').insertBlock(aos, 0);
      await new Promise(r => setTimeout(r, 400));
    });

    const { id, url } = await publishAndGetUrl(page);
    pageId = id;
    await page.goto(url);

    const root = page.locator('.wp-block-animate-on-scroll').first();
    const figure = root.locator('> figure.alignleft');
    // The image is marked itself, not wrapped, so the flow layout's
    // `> .alignleft` float still reaches it.
    await expect(figure).toHaveAttribute('data-animate-sequence-type', 'fade');
    await expect(figure).toHaveCSS('float', 'left');
  });
});
