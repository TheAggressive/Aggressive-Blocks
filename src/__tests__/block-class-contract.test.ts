/**
 * Stylesheets must style migrated blocks, not only their legacy aliases.
 *
 * WordPress derives a block's wrapper class from its name, so
 * aggressive-blocks/<slug> renders wp-block-aggressive-blocks-<slug> while the
 * temporary aggressive-apparel/<slug> alias renders
 * wp-block-aggressive-apparel-<slug>. A selector on the legacy wrapper class
 * alone silently stops matching once content is migrated.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import fg from 'fast-glob';
import postcss from 'postcss';

const root = path.resolve(__dirname, '../..');

function read(relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8');
}

const slugs = fg
  .sync('src/**/block.json', { cwd: root })
  .map(file => (JSON.parse(read(file)) as { name: string }).name)
  .map(name => name.replace(/^aggressive-blocks\//, ''));

// Markup that writes a legacy class out literally (render.php, edit.tsx)
// keeps matching after migration, so selectors on it are safe.
const markup = fg
  .sync(['src/**/*.{php,ts,tsx}', 'includes/**/*.php'], {
    cwd: root,
    ignore: ['**/__tests__/**'],
  })
  .map(read)
  .join('\n');

function isEmittedLiterally(className: string): boolean {
  return new RegExp(`['"\\s]${className}['"\\s]`).test(markup);
}

/** Bare legacy wrapper class, not a BEM element or modifier of it. */
function legacyWrapperIn(selector: string): string | null {
  for (const slug of slugs) {
    const legacy = `wp-block-aggressive-apparel-${slug}`;
    if (new RegExp(`\\.${legacy}(?![\\w-])`).test(selector)) {
      return slug;
    }
  }
  return null;
}

interface Violation {
  file: string;
  selector: string;
}

function findViolations(file: string, css: string): Violation[] {
  const violations: Violation[] = [];

  postcss.parse(css, { from: file }).walkRules(rule => {
    const selectors = rule.selectors ?? [];
    for (const selector of selectors) {
      const slug = legacyWrapperIn(selector);
      if (!slug) continue;

      const legacy = `wp-block-aggressive-apparel-${slug}`;
      if (isEmittedLiterally(legacy)) continue;

      const canonical = selector.replace(
        new RegExp(`\\.${legacy}(?![\\w-])`, 'g'),
        `.wp-block-aggressive-blocks-${slug}`
      );
      if (!selectors.includes(canonical)) {
        violations.push({ file, selector });
      }
    }
  });

  return violations;
}

describe('block wrapper classes in stylesheets', () => {
  it('discovers the plugin blocks', () => {
    expect(slugs).toContain('modal');
    expect(slugs.length).toBeGreaterThanOrEqual(13);
  });

  it('never targets only the legacy alias wrapper class', () => {
    const violations = fg
      .sync('src/**/*.css', { cwd: root })
      .flatMap(file => findViolations(file, read(file)));

    expect(violations).toEqual([]);
  });

  it('flags a legacy-only wrapper selector', () => {
    expect(
      findViolations('fixture.css', '.wp-block-aggressive-apparel-copyright {}')
    ).toHaveLength(1);
    expect(
      findViolations(
        'fixture.css',
        '.wp-block-aggressive-blocks-copyright, .wp-block-aggressive-apparel-copyright {}'
      )
    ).toEqual([]);
    expect(
      findViolations(
        'fixture.css',
        '.wp-block-aggressive-apparel-copyright__legal-link {}'
      )
    ).toEqual([]);
  });
});
