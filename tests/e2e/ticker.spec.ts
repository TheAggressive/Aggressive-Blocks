import { test, expect, type Locator, type Page } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

const PAUSE_LABEL = 'Pause animation';
const PLAY_LABEL = 'Play animation';

/** Insert a ticker with the given attributes, publish, and open it. */
async function createTickerPage(
  page: Page,
  attributes: Record<string, unknown> = {},
  content = 'Ticker item'
): Promise<number> {
  await openPageEditor(page);

  await page.evaluate(
    async ({ attributes, content }) => {
      const { createBlock } = window.wp.blocks;
      const ticker = createBlock('aggressive-blocks/ticker', attributes, [
        createBlock('core/paragraph', { content }),
      ]);
      window.wp.data.dispatch('core/block-editor').insertBlock(ticker);
      await new Promise(r => setTimeout(r, 400));
    },
    { attributes, content }
  );

  const { id, url } = await publishAndGetUrl(page);
  await page.goto(url);
  await tickerRoot(page).waitFor();

  return id;
}

function tickerRoot(page: Page): Locator {
  return page
    .locator('[data-wp-interactive="aggressive-blocks/ticker"]')
    .first();
}

/** The track's current horizontal translation, in px. */
function trackX(ticker: Locator): Promise<number> {
  return ticker
    .locator('.ticker__track')
    .evaluate(track => new DOMMatrix(getComputedStyle(track).transform).m41);
}

/**
 * Median per-sample movement of the track. The median ignores the one-off
 * jump when the loop wraps, leaving the steady scroll direction and rate.
 */
async function medianStep(ticker: Locator, samples = 9): Promise<number> {
  const steps: number[] = [];
  let previous = await trackX(ticker);

  for (let i = 0; i < samples; i += 1) {
    await ticker.page().waitForTimeout(50);
    const next = await trackX(ticker);
    steps.push(next - previous);
    previous = next;
  }

  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

/** Resolve once the track holds still (a pause glides before settling). */
async function expectSettled(ticker: Locator): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = await trackX(ticker);
        await ticker.page().waitForTimeout(200);
        return Math.abs((await trackX(ticker)) - before);
      },
      { timeout: 5_000 }
    )
    .toBe(0);
}

test.describe('Ticker — front end', () => {
  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test(
    'renders marquee and pauses on control click',
    { tag: '@webkit' },
    async ({ page }) => {
      pageId = await createTickerPage(page, {
        showLabel: true,
        labelText: 'LIVE',
      });

      const ticker = tickerRoot(page);
      await expect(ticker).toHaveAttribute('role', 'marquee');
      await expect(ticker.locator('.ticker__label')).toContainText('LIVE');

      const pause = ticker.locator('.ticker__pause');
      await expect(pause).toHaveAttribute('aria-pressed', 'false');
      await pause.click();
      await expect(ticker).toHaveClass(/is-paused/);
      await expect(pause).toHaveAttribute('aria-pressed', 'true');
      await expect(pause).toHaveAttribute('aria-label', PLAY_LABEL);
      await expectSettled(ticker);
    }
  );

  test('a hover hold keeps the control on pause', async ({ page }) => {
    pageId = await createTickerPage(page, { pauseOnHover: true });

    const ticker = tickerRoot(page);
    const pause = ticker.locator('.ticker__pause');

    // Hover the (stationary) root, clear of the control: the moving copy
    // never passes Playwright's "stable" actionability check.
    const box = await ticker.boundingBox();
    await ticker.hover({
      position: { x: (box?.width ?? 200) / 4, y: (box?.height ?? 40) / 2 },
    });
    await expect(ticker).toHaveClass(/is-paused/);
    // Held, not paused: the available action is still "pause".
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect(pause).toHaveAttribute('aria-label', PAUSE_LABEL);

    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');

    // Leaving keeps the manual pause.
    await page.mouse.move(0, 0);
    await expect(ticker).toHaveClass(/is-paused/);
    await expect(pause).toHaveAttribute('aria-label', PLAY_LABEL);
  });

  test('remembers a pause across page loads', async ({ page }) => {
    pageId = await createTickerPage(page, { pxPerSecond: 150 });

    const ticker = tickerRoot(page);
    await ticker.locator('.ticker__pause').click();
    await expect(ticker.locator('.ticker__pause')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await page.reload();
    const reloaded = tickerRoot(page);
    const pause = reloaded.locator('.ticker__pause');
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(pause).toHaveAttribute('aria-label', PLAY_LABEL);
    await expectSettled(reloaded);

    // Resuming forgets the preference.
    await pause.click();
    await page.mouse.move(0, 0);
    await page.reload();
    await expect(tickerRoot(page).locator('.ticker__pause')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await expect.poll(() => medianStep(tickerRoot(page))).toBeLessThan(0);
  });

  test(
    'reduced motion locks the marquee',
    { tag: '@webkit' },
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      pageId = await createTickerPage(page, { pxPerSecond: 150 });

      const ticker = tickerRoot(page);
      const pause = ticker.locator('.ticker__pause');
      await expect(pause).toBeDisabled();
      await expect(pause).toHaveAttribute('aria-pressed', 'true');
      await expect(ticker).toHaveClass(/is-paused/);
      await expectSettled(ticker);
    }
  );

  test('scrolls in the configured direction', async ({ page }) => {
    pageId = await createTickerPage(page, {
      pxPerSecond: 150,
      direction: 'right',
    });

    // Right-moving copy translates the track toward positive x.
    await expect.poll(() => medianStep(tickerRoot(page))).toBeGreaterThan(0);
  });

  test('fills the scroll area with identical, hidden copies', async ({
    page,
  }) => {
    pageId = await createTickerPage(page, { pxPerSecond: 150 });

    const ticker = tickerRoot(page);
    await expect(ticker.locator('.ticker__content').nth(2)).toBeAttached();

    const layout = await ticker.evaluate(root => {
      const scroll = root.querySelector('.ticker__scroll') as HTMLElement;
      const copies = Array.from(
        root.querySelectorAll<HTMLElement>('.ticker__content')
      );
      return {
        scrollWidth: scroll.getBoundingClientRect().width,
        widths: copies.map(copy => copy.getBoundingClientRect().width),
        hiddenCopies: copies
          .slice(1)
          .every(
            copy =>
              copy.getAttribute('aria-hidden') === 'true' &&
              copy.hasAttribute('inert')
          ),
        exposedCopies: copies.filter(
          copy => copy.getAttribute('aria-hidden') !== 'true'
        ).length,
      };
    });

    const [copyWidth] = layout.widths;
    const trackWidth = layout.widths.reduce((sum, width) => sum + width, 0);

    // Every copy matches, so wrapping by one copy width is seamless…
    for (const width of layout.widths) {
      expect(Math.abs(width - copyWidth)).toBeLessThan(1);
    }
    // …and the track stays longer than the viewport plus one wrap.
    expect(trackWidth).toBeGreaterThanOrEqual(layout.scrollWidth + copyWidth);
    // Screen readers get exactly one copy.
    expect(layout.exposedCopies).toBe(1);
    expect(layout.hiddenCopies).toBe(true);
  });

  test(
    'keyboard reaches the control before links in the moving copy',
    { tag: '@webkit' },
    async ({ page }) => {
      pageId = await createTickerPage(
        page,
        {},
        'Ticker item <a href="#shop">Shop now</a>'
      );

      const ticker = tickerRoot(page);
      const firstFocusInTicker = async (): Promise<string | null> => {
        for (let i = 0; i < 60; i += 1) {
          await page.keyboard.press('Tab');
          const focused = await ticker.evaluate(root => {
            const active = document.activeElement;
            if (!active || !root.contains(active)) {
              return null;
            }
            return active.classList.contains('ticker__pause')
              ? 'control'
              : active.tagName.toLowerCase();
          });
          if (focused) {
            return focused;
          }
        }
        return null;
      };

      expect(await firstFocusInTicker()).toBe('control');
    }
  );
});
