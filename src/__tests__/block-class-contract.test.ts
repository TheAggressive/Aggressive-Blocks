/**
 * Stylesheets must not target a wrapper class no block renders.
 *
 * WordPress derives a block's wrapper class from its name, so
 * aggressive-blocks/<slug> renders wp-block-aggressive-blocks-<slug>. The
 * aggressive-apparel/<slug> aliases that rendered
 * wp-block-aggressive-apparel-<slug> were removed in 2.0.0, so a selector on
 * that generated class matches nothing. Markup that writes a legacy-prefixed
 * class out literally (BEM elements, the ticker root) is unaffected.
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

      if (isEmittedLiterally(`wp-block-aggressive-apparel-${slug}`)) continue;

      violations.push({ file, selector });
    }
  });

  return violations;
}

/** Selectors in script string literals (querySelector, closest, ...). */
function findScriptViolations(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  for (const [literal] of source.matchAll(/(['"`])(?:(?!\1).)*\1/g)) {
    const slug = legacyWrapperIn(literal);
    if (!slug) continue;
    if (isEmittedLiterally(`wp-block-aggressive-apparel-${slug}`)) continue;
    violations.push({ file, selector: literal });
  }
  return violations;
}

describe('block wrapper classes in scripts', () => {
  it('never select the removed alias wrapper class', () => {
    const violations = fg
      .sync('src/**/*.{ts,tsx}', { cwd: root, ignore: ['**/__tests__/**'] })
      .flatMap(file => findScriptViolations(file, read(file)));

    expect(violations).toEqual([]);
  });

  it('flags a script selector on the removed alias wrapper class', () => {
    expect(
      findScriptViolations(
        'fixture.ts',
        "root.closest('.wp-block-aggressive-apparel-hero-carousel');"
      )
    ).toHaveLength(1);
    expect(
      findScriptViolations(
        'fixture.ts',
        "root.querySelector('.wp-block-aggressive-apparel-modal__trigger');"
      )
    ).toEqual([]);
  });
});

describe('block wrapper classes in stylesheets', () => {
  it('discovers the plugin blocks', () => {
    expect(slugs).toContain('modal');
    expect(slugs.length).toBeGreaterThanOrEqual(13);
  });

  it('never targets the removed alias wrapper class', () => {
    const violations = fg
      .sync('src/**/*.css', { cwd: root })
      .flatMap(file => findViolations(file, read(file)));

    expect(violations).toEqual([]);
  });

  it('flags a selector on the removed alias wrapper class', () => {
    expect(
      findViolations('fixture.css', '.wp-block-aggressive-apparel-copyright {}')
    ).toHaveLength(1);
    expect(
      findViolations(
        'fixture.css',
        '.wp-block-aggressive-blocks-copyright, .wp-block-aggressive-apparel-copyright {}'
      )
    ).toHaveLength(1);
    expect(
      findViolations('fixture.css', '.wp-block-aggressive-apparel-ticker {}')
    ).toEqual([]);
    expect(
      findViolations(
        'fixture.css',
        '.wp-block-aggressive-apparel-copyright__legal-link {}'
      )
    ).toEqual([]);
  });
});
