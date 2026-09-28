import { test, expect, type Page } from '@playwright/test';
import { openPageEditor, publishAndGetUrl } from '../e2e/helpers';

/**
 * Aggressive Apparel with the packaged plugin (bin/ci/integration.sh).
 *
 * The theme's own templates, template parts, and patterns are read from the
 * running site, so coverage follows whatever the theme ships: every plugin
 * block it uses must register, load valid in the editor, and render on the
 * front end.
 */

const THEME = 'aggressive-apparel';

/** Legacy names 2.0 no longer registers (Block_Renamer::SLUGS). */
const LEGACY = [
  'animate-on-scroll',
  'parallax',
  'modal',
  'card-flip',
  'card-flip-front',
  'card-flip-back',
  'horizontal-scroll',
  'hero-carousel',
  'ticker',
  'split-story',
  'split-story-media',
  'split-story-content',
  'copyright',
].map(slug => `aggressive-apparel/${slug}`);

type Usage = {
  source: string;
  name: string;
  registered: boolean;
  valid: boolean;
  missing: boolean;
  issue?: string;
};

type ThemeUsage = {
  usages: Usage[];
  patterns: string[];
  parts: Record<string, string[]>;
  templates: Record<string, string[]>;
};

/** Every plugin block in the theme's templates, parts, and patterns. */
async function readThemeUsage(page: Page): Promise<ThemeUsage> {
  await openPageEditor(page);
  return page.evaluate(
    async ({ theme, legacy }) => {
      const { parse, getBlockType } = window.wp.blocks;
      const apiFetch = window.wp.apiFetch;
      const ours = (name: string) =>
        name.startsWith('aggressive-blocks/') || legacy.includes(name);

      const usages: Usage[] = [];
      const collect = (source: string, content: string): string[] => {
        const names: string[] = [];
        const walk = (blocks: any[]) =>
          blocks.forEach(block => {
            const missing = block.name === 'core/missing';
            const name = missing ? block.attributes.originalName : block.name;
            if (ours(name)) {
              names.push(name);
              const [issue] = block.validationIssues ?? [];
              usages.push({
                source,
                name,
                registered: !!getBlockType(name),
                valid: block.isValid,
                missing,
                // The validator's message, with its %s placeholders filled.
                ...(issue && {
                  issue: issue.args
                    .slice(1)
                    .reduce(
                      (text: string, arg: unknown) =>
                        text.replace(/%[so]/, String(arg)),
                      String(issue.args[0])
                    ),
                }),
              });
            }
            walk(block.innerBlocks);
          });
        walk(parse(content));
        return names;
      };

      const [templates, parts, patterns] = await Promise.all(
        ['templates', 'template-parts']
          .map(type =>
            apiFetch({ path: `/wp/v2/${type}?context=edit&per_page=100` })
          )
          .concat(apiFetch({ path: '/wp/v2/block-patterns/patterns' }))
      );

      const byName = (items: any[], kind: string) =>
        Object.fromEntries(
          items
            .filter(item => item.theme === theme)
            .map(item => [
              item.slug,
              collect(`${kind} ${item.slug}`, item.content.raw),
            ])
        );

      const themeTemplates = byName(templates, 'template');
      const themeParts = byName(parts, 'part');
      const themePatterns = patterns
        .filter((pattern: any) => pattern.name.startsWith(`${theme}/`))
        .filter(
          (pattern: any) =>
            collect(`pattern ${pattern.name}`, pattern.content).length > 0
        )
        .map((pattern: any) => pattern.name);

      return {
        usages,
        patterns: themePatterns,
        parts: themeParts,
        templates: themeTemplates,
      };
    },
    { theme: THEME, legacy: LEGACY }
  );
}

/** Fail the test on any uncaught script error while `run` loads pages. */
async function withoutScriptErrors(
  page: Page,
  run: () => Promise<void>
): Promise<void> {
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  page.on('pageerror', onError);
  try {
    await run();
  } finally {
    page.off('pageerror', onError);
  }
  expect(errors).toEqual([]);
}

/**
 * The block rendered, and blocks with a view script show that it ran.
 */
async function expectRendered(page: Page, names: string[]): Promise<void> {
  for (const name of new Set(names)) {
    const slug = name.replace('aggressive-blocks/', '');
    const root = page.locator(`.wp-block-aggressive-blocks-${slug}`).first();
    await expect(root, `${name} rendered`).toBeAttached();

    if (slug === 'horizontal-scroll') {
      await expect(root).toHaveClass(/\bis-(horizontal|static)\b/);
    }
    if (slug === 'animate-on-scroll') {
      await root.scrollIntoViewIfNeeded();
      await expect(root).toHaveClass(/\bis-visible\b/);
    }
    if (slug === 'ticker') {
      await expect
        .poll(() =>
          root.evaluate(el =>
            el
              .getAnimations({ subtree: true })
              .some(animation => animation.playState === 'running')
          )
        )
        .toBe(true);
    }
  }
}

test.describe('Aggressive Apparel with Aggressive Blocks', () => {
  let usage: ThemeUsage;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: process.env.WP_BASE_URL,
      storageState: 'tests/e2e/.auth/admin.json',
    });
    usage = await readThemeUsage(await context.newPage());
    await context.close();
  });

  test('every plugin block the theme uses registers and loads valid in the editor', () => {
    const summary = [...new Set(usage.usages.map(u => u.name))].sort();
    console.log(`Plugin blocks the theme uses: ${summary.join(', ')}`);

    expect(summary.length, 'the theme uses plugin blocks').toBeGreaterThan(0);
    expect(
      usage.usages.filter(u => LEGACY.includes(u.name)),
      'theme content still uses a removed aggressive-apparel/* name'
    ).toEqual([]);
    expect(usage.usages.filter(u => u.missing || !u.registered)).toEqual([]);
    expect(usage.usages.filter(u => !u.valid)).toEqual([]);
  });

  test('header and footer parts render their plugin blocks on the front page', async ({
    page,
  }) => {
    const names = [
      ...(usage.parts.header ?? []),
      ...(usage.parts.footer ?? []),
    ];
    await withoutScriptErrors(page, async () => {
      await page.goto('/');
      await expectRendered(page, names);
    });
  });

  test('the single-product template renders its plugin blocks', async ({
    page,
  }) => {
    const url = process.env.AB_INTEGRATION_PRODUCT_URL;
    expect(url, 'bin/ci/integration.sh creates a product').toBeTruthy();

    await withoutScriptErrors(page, async () => {
      await page.goto(url as string);
      await expectRendered(page, usage.templates['single-product'] ?? []);
    });
  });

  test('theme patterns render their plugin blocks', async ({ page }) => {
    expect(usage.patterns.length).toBeGreaterThan(0);

    await openPageEditor(page);
    await page.evaluate(async slugs => {
      const { createBlock } = window.wp.blocks;
      window.wp.data
        .dispatch('core/block-editor')
        .resetBlocks(slugs.map(slug => createBlock('core/pattern', { slug })));
      await new Promise(resolve => setTimeout(resolve, 400));
    }, usage.patterns);
    const { url } = await publishAndGetUrl(page);

    const names = usage.usages
      .filter(u => u.source.startsWith('pattern '))
      .map(u => u.name);
    await withoutScriptErrors(page, async () => {
      await page.goto(url);
      await expectRendered(page, names);
    });
  });
});
