import { test, expect, type Browser } from '@playwright/test';
import { openPageEditor, publishAndGetUrl, deletePage } from './helpers';

/**
 * Block assets load where their block renders, and nowhere else.
 *
 * Each block declares its stylesheet and view module in block.json, and
 * WordPress enqueues them only when the block renders. Nothing here is a
 * custom loader: these tests prove core's on-demand loading holds for every
 * asset the plugin ships, as an anonymous visitor sees it.
 */

const PLUGIN_ASSET = '/wp-content/plugins/aggressive-blocks/';

/** Every plugin asset a visitor's page requests, links, inlines, or maps. */
async function pluginAssets(browser: Browser, url: string): Promise<string[]> {
  const visitor = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const page = await visitor.newPage();
    const requested: string[] = [];
    page.on('request', request => {
      if (request.url().includes(PLUGIN_ASSET)) {
        requested.push(new URL(request.url()).pathname);
      }
    });
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    const inDocument = await page.evaluate(pluginPath => {
      // Handles WordPress derives from the block name, including styles it
      // inlines instead of linking.
      const found = Array.from(
        document.querySelectorAll('[id^="aggressive-blocks-"]')
      )
        .filter(el => ['LINK', 'STYLE', 'SCRIPT'].includes(el.tagName))
        .map(el => `#${el.id}`);
      const importMap = document.querySelector('script[type="importmap"]');
      const imports = importMap
        ? Object.values<string>(
            JSON.parse(importMap.textContent ?? '{}').imports ?? {}
          )
        : [];
      return found.concat(imports.filter(src => src.includes(pluginPath)));
    }, PLUGIN_ASSET);

    return [...new Set([...requested, ...inDocument])];
  } finally {
    await visitor.close();
  }
}

test.describe('Asset loading', () => {
  let pageId = 0;

  test.afterEach(async ({ page }) => {
    await deletePage(page, pageId);
    pageId = 0;
  });

  test('a page without plugin blocks loads none of their assets', async ({
    page,
    browser,
  }) => {
    await openPageEditor(page);
    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      window.wp.data
        .dispatch('core/block-editor')
        .resetBlocks([
          createBlock('core/heading', { level: 2, content: 'Plain page' }),
          createBlock('core/group', {}, [
            createBlock('core/paragraph', { content: 'Only core blocks.' }),
          ]),
          createBlock('core/buttons', {}, [
            createBlock('core/button', { text: 'Shop', url: '#shop' }),
          ]),
        ]);
      await new Promise(resolve => setTimeout(resolve, 400));
    });
    const published = await publishAndGetUrl(page);
    pageId = published.id;

    expect(await pluginAssets(browser, published.url)).toEqual([]);
  });

  test('a page with one plugin block loads only that block’s assets', async ({
    page,
    browser,
  }) => {
    await openPageEditor(page);
    await page.evaluate(async () => {
      const { createBlock } = window.wp.blocks;
      window.wp.data
        .dispatch('core/block-editor')
        .resetBlocks([
          createBlock('aggressive-blocks/modal', { triggerLabel: 'Open' }, [
            createBlock('core/paragraph', { content: 'Modal body' }),
          ]),
        ]);
      await new Promise(resolve => setTimeout(resolve, 400));
    });
    const published = await publishAndGetUrl(page);
    pageId = published.id;

    const assets = await pluginAssets(browser, published.url);
    // Proves the detector sees plugin assets at all.
    expect(assets.some(asset => asset.endsWith('/modal/view.js'))).toBe(true);
    expect(
      assets.filter(
        asset =>
          !asset.includes('/modal/') &&
          !asset.startsWith('#aggressive-blocks-modal-')
      )
    ).toEqual([]);
  });
});
