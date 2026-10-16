import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const asset = (name: string) =>
  readFileSync(
    path.resolve(`build/blocks-interactivity/animate-on-scroll/${name}`),
    'utf8'
  );

declare global {
  interface Window {
    aosFixture: {
      init: () => (() => void) | undefined;
      cleanup?: () => void;
      events: string[];
    };
  }
}

// Run the shipped store with real observers, CSS and animation events. The
// adapter supplies only WordPress context/class bindings, without a WP server.
async function prepare(page: Page, effect = 'slide', sequence = false) {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.setContent(`
    <style>body { margin: 0; } .spacer { height: 850px; }</style>
    <div class="spacer"></div>
    <div class="wp-block-animate-on-scroll ${sequence ? 'has-animation-sequence' : ''}"
      data-wp-interactive="test" data-animate-type="${sequence ? '' : effect}"
      data-animate-direction="${effect === 'bounce' ? 'standard' : 'left'}"
      style="--wp-block-animate-on-scroll-animation-duration: 0.12s">
      <div style="height: 100px" ${sequence ? 'data-animate-sequence-type="slide" data-animate-sequence-direction="left"' : ''}>First</div>
      <div style="height: 100px" ${sequence ? 'data-animate-sequence-type="bounce"' : ''}>Second</div>
    </div>
    <div style="height: 2000px"></div>
  `);
  await page.addStyleTag({ content: asset('style-index.css') });
  const adapter = `
    const root = document.querySelector('.wp-block-animate-on-scroll');
    window.aosFixture = { events: [] };
    const classes = {isVisible: 'is-visible', isExiting: 'is-exiting', hasAnimated: 'has-animated'};
    const context = new Proxy({
      id: 'lifecycle', isVisible: false, hasAnimated: false, isExiting: false,
      debugMode: false, visibilityTrigger: '0.6', reverseOnScrollBack: true,
      detectionBoundary: {top: '0px', right: '0px', bottom: '0px', left: '0px'}
    }, {set(target, key, value) {
      target[key] = value;
      if (classes[key]) root.classList.toggle(classes[key], value);
      return true;
    }});
    root.addEventListener('transitionrun', event => {
      if (event.propertyName === 'opacity') window.aosFixture.events.push('opacity');
    });
    root.addEventListener('animationstart', event => window.aosFixture.events.push(event.animationName));
    export const getContext = () => context;
    export const getElement = () => ({ref: root});
    export const store = (_name, config) => {window.aosFixture.init = config.callbacks.initObserver;};
  `;
  await page.addScriptTag({
    type: 'importmap',
    content: JSON.stringify({
      imports: {
        '@wordpress/interactivity':
          'data:text/javascript,' + encodeURIComponent(adapter),
      },
    }),
  });
  await page.addScriptTag({ type: 'module', content: asset('view.js') });
  await page.waitForFunction(() => !!window.aosFixture?.init);
  return page.locator('.wp-block-animate-on-scroll');
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.aosFixture?.cleanup?.());
});

for (const effect of ['fade', 'slide', 'bounce', 'sequence']) {
  test(`${effect} waits for its first scroll trigger without an exit @webkit`, async ({
    page,
  }) => {
    const root = await prepare(page, effect, effect === 'sequence');
    const first = root.locator('> div').first();
    await expect(first).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => window.aosFixture.events)).toEqual([]);

    await page.evaluate(() => {
      window.aosFixture.cleanup = window.aosFixture.init();
    });
    await expect(first).toHaveCSS('opacity', '0');
    await page.evaluate(() => window.scrollTo(0, 10));
    // Give real observers and animation events two rendering frames.
    await page.evaluate(
      () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
    await expect(root).not.toHaveClass(/is-visible|is-exiting|has-animated/);
    expect(await page.evaluate(() => window.aosFixture.events)).toEqual([]);

    await page.evaluate(() => window.scrollTo(0, 100));
    await expect(root).toHaveClass(/is-visible/);
    await expect(first).toHaveCSS('opacity', '1');
    await expect
      .poll(() => page.evaluate(() => window.aosFixture.events.length))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.aosFixture.events)).not.toContain(
      'bounce-out'
    );

    // Reverse is allowed only after that first entrance actually triggered.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(root).not.toHaveClass(/is-visible/);
    await expect(first).toHaveCSS('opacity', '0');
  });
}

for (const change of ['viewport', 'content']) {
  test(`recalculates a tall block's trigger after ${change} resizing @webkit`, async ({
    page,
  }) => {
    const root = await prepare(page);
    await root.evaluate(el => {
      (el.previousElementSibling as HTMLElement).style.height = '2000px';
      for (const child of Array.from(el.children)) {
        (child as HTMLElement).style.height = '1000px';
      }
    });
    await page.evaluate(() => {
      window.aosFixture.cleanup = window.aosFixture.init();
    });
    await expect(root.locator('> div').first()).toHaveCSS('opacity', '0');

    if (change === 'viewport') {
      await page.setViewportSize({ width: 375, height: 400 });
    } else {
      await root.evaluate(el => {
        for (const child of Array.from(el.children)) {
          (child as HTMLElement).style.height = '4000px';
        }
      });
    }
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect(root).toHaveClass(/is-visible/);
    await expect(root.locator('> div').first()).toHaveCSS('opacity', '1');
  });
}
