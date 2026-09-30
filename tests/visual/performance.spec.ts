import { test, expect, type Page } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from '../e2e/helpers';

/**
 * Page-speed budgets for a page that uses every block, served from the
 * release ZIP by the native visual lane (bin/ci/visual.sh). Motion is on,
 * because reduced motion switches off the animation work being measured.
 * Desktop Chromium only: the mobile project runs @mobile screenshots, and CPU
 * throttling needs the Chrome DevTools Protocol.
 *
 * Measured locally when set (three runs each): load blocking 0-5ms at 4x CPU
 * slowdown, layout shift 0.0001, slowest interaction 56-64ms at full speed.
 */

/**
 * Cumulative Layout Shift after loading and scrolling the page. "Good" is
 * 0.1; blocks should shift nothing, so allow only sub-pixel noise.
 */
const CLS_BUDGET = 0.01;
/** Total Blocking Time during load at 4x CPU slowdown: Lighthouse mobile "good". */
const TBT_BUDGET_MS = 200;
/**
 * Slowest interaction at full CPU speed: the Interaction to Next Paint "good"
 * limit. It is not throttled: closing the Modal takes 150-184ms at 4x, too
 * close to the limit for a runner of unknown speed to decide reliably.
 */
const INTERACTION_BUDGET_MS = 200;

type Metrics = {
  cls: number;
  tbt: number;
  longTasks: number[];
  interactions: Array<{ name: string; duration: number }>;
};

declare global {
  interface Window {
    __aaPerf: Metrics;
  }
}

test.use({ reducedMotion: 'no-preference' });

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
    const cover = (label: string, color: string, minHeight = 360) =>
      createBlock(
        'core/cover',
        { dimRatio: 100, customOverlayColor: color, isDark: true, minHeight },
        [heading(label), paragraph('Fixed copy for the budget page.')]
      );
    const filler = (label: string) =>
      createBlock('core/group', {}, [
        heading(label),
        ...Array.from({ length: 4 }, () =>
          paragraph(
            'Heavyweight fleece, cut and sewn in small runs, finished by hand.'
          )
        ),
      ]);

    window.wp.data.dispatch('core/block-editor').resetBlocks([
      createBlock(
        'aggressive-blocks/hero-carousel',
        { autoplay: true, autoplaySpeed: 3000 },
        [
          cover('Slide One', '#1b1b1b'),
          cover('Slide Two', '#3a1f5c'),
          cover('Slide Three', '#0f4c3a'),
        ]
      ),
      createBlock(
        'aggressive-blocks/ticker',
        { showLabel: true, labelText: 'NEW' },
        [paragraph('Free shipping over $50'), paragraph('Drop 07 is live')]
      ),
      filler('Intro'),
      createBlock('aggressive-blocks/animate-on-scroll', {}, [
        filler('Revealed on scroll'),
      ]),
      createBlock('aggressive-blocks/parallax', {}, [
        cover('Parallax', '#2d2d2d', 480),
      ]),
      createBlock(
        'aggressive-blocks/card-flip',
        { flipOn: 'click', style: { dimensions: { aspectRatio: '16/9' } } },
        [
          createBlock('aggressive-blocks/card-flip-front', {}, [
            heading('Front'),
          ]),
          createBlock('aggressive-blocks/card-flip-back', {}, [
            heading('Back'),
          ]),
        ]
      ),
      createBlock('aggressive-blocks/split-story', {}, [
        createBlock('aggressive-blocks/split-story-media', {}, [
          cover('Media column', '#2d2d2d', 420),
        ]),
        createBlock('aggressive-blocks/split-story-content', {}, [
          filler('The story'),
        ]),
      ]),
      createBlock(
        'aggressive-blocks/horizontal-scroll',
        { ariaLabel: 'Budget gallery', itemWidth: '60vw', align: 'full' },
        ['One', 'Two', 'Three'].map((label, index) =>
          cover(`Panel ${label}`, ['#1b1b1b', '#3a1f5c', '#0f4c3a'][index])
        )
      ),
      filler('Outro'),
      createBlock(
        'aggressive-blocks/modal',
        { triggerLabel: 'Open size guide' },
        [heading('Size guide'), paragraph('Measure a hoodie you already own.')]
      ),
      createBlock('aggressive-blocks/copyright', {}),
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

/**
 * Record layout shifts, long tasks and interaction latency from the first
 * byte, with the browser's own observers.
 */
async function observe(page: Page, cpuSlowdown = 1): Promise<void> {
  if (cpuSlowdown > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  }
  await page.addInitScript(() => {
    const supported = PerformanceObserver.supportedEntryTypes;
    for (const type of ['layout-shift', 'longtask', 'event']) {
      // Fail loudly rather than measure nothing in a browser without it.
      if (!supported.includes(type)) throw new Error(`No ${type} entries.`);
    }
    const metrics: Metrics = {
      cls: 0,
      tbt: 0,
      longTasks: [],
      interactions: [],
    };
    window.__aaPerf = metrics;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >) {
        if (!entry.hadRecentInput) metrics.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        metrics.longTasks.push(Math.round(entry.duration));
        metrics.tbt += Math.max(0, entry.duration - 50);
      }
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { interactionId?: number; target?: Element | null }
      >) {
        if (!entry.interactionId) continue;
        metrics.interactions.push({
          name: `${entry.name} ${entry.target?.getAttribute('class') ?? ''}`.trim(),
          duration: Math.round(entry.duration),
        });
      }
    }).observe({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  });
}

/** Wait for two rendered frames, so observers have seen the last change. */
function settle(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => window.__aaPerf);
}

test('loading and scrolling every block stays within the budgets', async ({
  page,
}) => {
  // A mid-range phone, as Lighthouse's mobile run assumes.
  await observe(page, 4);
  await page.goto(pageUrl);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const afterLoad = await metrics(page);
  expect(afterLoad, 'performance observers ran').toBeDefined();

  // Scroll the whole page one viewport at a time, the way a reader does:
  // animate-on-scroll reveals, parallax moves, and the gallery pins.
  const height = await page.evaluate(() => document.body.scrollHeight);
  const viewport = page.viewportSize()?.height ?? 800;
  for (let y = 0; y <= height; y += viewport / 2) {
    await page.evaluate(top => window.scrollTo(0, top), y);
    await settle(page);
  }
  const afterScroll = await metrics(page);

  console.log(
    `[budget] load TBT ${Math.round(afterLoad.tbt)}ms (long tasks ${JSON.stringify(afterLoad.longTasks)}), ` +
      `CLS after load ${afterLoad.cls.toFixed(4)}, after scroll ${afterScroll.cls.toFixed(4)}`
  );
  expect(
    afterLoad.tbt,
    'Total Blocking Time during load (ms)'
  ).toBeLessThanOrEqual(TBT_BUDGET_MS);
  expect(afterScroll.cls, 'Cumulative Layout Shift').toBeLessThanOrEqual(
    CLS_BUDGET
  );
});

test('every block control responds within the interaction budget', async ({
  page,
}) => {
  await observe(page);
  await page.goto(pageUrl);
  await page.waitForLoadState('networkidle');

  const hero = page.locator('.aa-hero').first();
  await hero.getByRole('button', { name: /pause slideshow/i }).click();
  await hero.getByRole('button', { name: /next/i }).first().click();

  const card = page.locator('.aa-card-flip').first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('.aa-card-flip__toggle').click();
  await expect(card).toHaveClass(/is-flipped/);

  await page.locator('.wp-block-aggressive-apparel-modal__trigger').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await settle(page);

  const { interactions } = await metrics(page);
  const slowest = Math.max(0, ...interactions.map(entry => entry.duration));
  console.log(
    `[budget] slowest interaction ${slowest}ms of ${JSON.stringify(interactions)}`
  );
  expect(slowest, 'Slowest interaction (ms)').toBeLessThanOrEqual(
    INTERACTION_BUDGET_MS
  );
});
