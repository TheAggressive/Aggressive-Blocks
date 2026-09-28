import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { openPageEditor } from './helpers';

/**
 * The 1.x → 2.0 saved-content contract, checked in the block editor.
 *
 * The fixtures are 1.x serializations (see docs/migration.md) and the goldens
 * the migration produces from them; PHPUnit proves the rewrite itself. Here
 * the editor proves the result: 2.0 has no aliases, so legacy content is
 * missing until migrated, and migrating never breaks a block that was valid
 * under the 1.x names.
 */

const FIXTURES = path.join('tests', 'fixtures', 'migration');

/** The slugs Block_Renamer::SLUGS moves. */
const MOVED = [
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
];

type Report = { name: string; valid: boolean; missing: boolean }[];

const fixtures = readdirSync(path.join(FIXTURES, 'legacy')).filter(file =>
  file.endsWith('.html')
);

test.describe('1.x → 2.0 block migration', () => {
  test('migrated 1.x content loads in the 2.0 editor without breaking blocks', async ({
    page,
  }) => {
    expect(fixtures.length).toBeGreaterThan(0);
    await openPageEditor(page);

    for (const file of fixtures) {
      const legacy = readFileSync(path.join(FIXTURES, 'legacy', file), 'utf8');
      const migrated = readFileSync(
        path.join(FIXTURES, 'migrated', file),
        'utf8'
      );

      const result = await page.evaluate(
        ({ legacy: legacyHtml, migrated: migratedHtml, moved }) => {
          const {
            parse,
            getBlockType,
            registerBlockType,
            unregisterBlockType,
          } = window.wp.blocks;
          const legacyNames = new Set(
            moved.map((slug: string) => `aggressive-apparel/${slug}`)
          );
          const currentNames = new Set(
            moved.map((slug: string) => `aggressive-blocks/${slug}`)
          );

          // Plugin blocks in document order. A missing block keeps its
          // original name, so legacy and migrated reports line up.
          const report = (content: string): Report => {
            const out: Report = [];
            const walk = (blocks: any[]) =>
              blocks.forEach(block => {
                const name =
                  block.name === 'core/missing'
                    ? block.attributes.originalName
                    : block.name;
                if (legacyNames.has(name) || currentNames.has(name)) {
                  out.push({
                    name,
                    valid: block.isValid,
                    missing: block.name === 'core/missing',
                  });
                }
                walk(block.innerBlocks);
              });
            walk(parse(content));
            return out;
          };

          const withoutAliases = report(legacyHtml);

          // What 1.x registered: each block again under its legacy name
          // (src/utils/register-theme-block.ts at v1.0.0).
          moved.forEach((slug: string) => {
            const registered = getBlockType(`aggressive-blocks/${slug}`);
            registerBlockType(`aggressive-apparel/${slug}`, {
              ...registered,
              name: `aggressive-apparel/${slug}`,
              supports: { ...registered.supports, inserter: false },
            });
          });

          const under1x = report(legacyHtml);
          moved.forEach((slug: string) =>
            unregisterBlockType(`aggressive-apparel/${slug}`)
          );

          return { withoutAliases, under1x, under2x: report(migratedHtml) };
        },
        { legacy, migrated, moved: MOVED }
      );

      const { withoutAliases, under1x, under2x } = result;
      expect(under1x.length, `${file} has plugin blocks`).toBeGreaterThan(0);

      // 2.0 does not know the legacy names: that is why migration exists.
      expect(
        withoutAliases.filter(
          block =>
            block.name.startsWith('aggressive-apparel/') && !block.missing
        ),
        `${file}: 2.0 still resolves a legacy name`
      ).toEqual([]);

      // Same blocks, now under current names, none missing.
      expect(
        under2x.map(block => block.name),
        `${file}: migrated names`
      ).toEqual(
        under1x.map(block =>
          block.name.replace('aggressive-apparel/', 'aggressive-blocks/')
        )
      );
      expect(under2x.filter(block => block.missing)).toEqual([]);

      // Nothing valid under 1.x becomes invalid under 2.0.
      const broken = under2x.filter(
        (block, index) => under1x[index]?.valid && !block.valid
      );
      expect(broken, `${file}: blocks the migration made invalid`).toEqual([]);
    }
  });
});
