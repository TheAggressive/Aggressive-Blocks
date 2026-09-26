/**
 * Animate On Scroll stylesheet contracts.
 *
 * jsdom does not resolve var() or run the full cascade, so these lock in
 * the shape of style.css that past regressions broke:
 *
 * - Stagger: a stronger rule once set transition-delay without the per-child
 *   stagger, so every child fired at once. One effective-delay token now
 *   feeds every transition and animation delay.
 * - Bounce: `transform: none !important` on visible states killed the
 *   bounce keyframes. !important is reserved for reduced motion and print.
 * - Fixed content: identity end states (blur(0), translate(0, 0)) made each
 *   child the containing block for position: fixed descendants.
 *
 * @jest-environment jsdom
 */

import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Remove one `@media <query> { … }` block, braces balanced. */
const withoutMedia = (source: string, query: string): string => {
  const start = source.indexOf(`@media ${query}`);
  if (start === -1) return source;
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) {
      return source.slice(0, start) + source.slice(i + 1);
    }
  }
  return source;
};

describe('animate-on-scroll stylesheet', () => {
  it('feeds every delay from one effective-delay token', () => {
    expect(rules).toMatch(
      /\[data-stagger-children="true"\] > \* \{\s*--wp-block-animate-on-scroll-effective-delay:\s*calc\(/
    );

    const transitionDelays = rules.match(/transition-delay:[^;]+;/g) ?? [];
    expect(transitionDelays).toEqual([
      'transition-delay: var(--wp-block-animate-on-scroll-effective-delay);',
    ]);
    expect(rules).not.toMatch(/animation-delay:/);

    const animations = rules.match(/animation:\s*[a-z-]+-(?:in|out) [^;]+;/g);
    expect(animations?.length).toBeGreaterThan(0);
    animations?.forEach(animation => {
      expect(animation).toContain(
        'var(--wp-block-animate-on-scroll-effective-delay)'
      );
    });
  });

  it('keeps !important out of everything but reduced motion and print', () => {
    const rest = withoutMedia(
      withoutMedia(rules, '(prefers-reduced-motion: reduce)'),
      'print'
    );
    expect(rest).not.toMatch(/!important/);
  });

  it('settles on none rather than identity filters and transforms', () => {
    expect(rules).not.toMatch(/blur\(0(?:px)?\)/);
    expect(rules).not.toMatch(/translate\(0,\s*0\)/);
    expect(rules).not.toMatch(/translateY\(0\)/);
    expect(rules).not.toMatch(/scale\(1\)/);
    expect(rules).not.toMatch(/rotate\(0deg\)/);
  });

  it('plays the first-paint entrance on the front end only', () => {
    expect(rules).toMatch(
      /&\[data-wp-interactive\] > \* \{\s*@starting-style \{/
    );
    expect(rules.match(/@starting-style/g)).toHaveLength(1);
  });

  it('ships the bounce-family keyframes, in and out', () => {
    ['bounce', 'elastic', 'spring'].forEach(name => {
      expect(css).toMatch(new RegExp(`@keyframes ${name}-in\\b`));
      expect(css).toMatch(new RegExp(`@keyframes ${name}-out\\b`));
    });
  });
});
