/** @jest-environment jsdom */

import { cleanupAllHighlights, createDirectHighlight } from '../highlights';

jest.mock('../editor-dom', () => ({
  getOwnerView: (element: HTMLElement) => element.ownerDocument.defaultView,
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  cleanupAllHighlights();
  jest.useRealTimers();
  document.body.innerHTML = '';
});

it('restores authored styles and priorities without touching unrelated blue styles', () => {
  const target = document.createElement('button');
  target.className = 'modal-trigger-test';
  target.style.cssText =
    'outline: 1px solid red !important; position: absolute; padding: 20px; margin: 10px; border: 2px solid green; background: yellow';
  const unrelated = document.createElement('div');
  unrelated.style.cssText =
    'outline: 3px solid rgb(0, 124, 186); box-shadow: 0 0 2px rgb(0, 124, 186)';
  document.body.append(target, unrelated);
  const originalStyles = target.style.cssText;
  const unrelatedStyles = unrelated.style.cssText;

  expect(createDirectHighlight(target, 'test')).not.toBeNull();
  target.classList.add('editor-added-class');
  cleanupAllHighlights();

  expect(target.style.cssText).toBe(originalStyles);
  expect(target.style.getPropertyPriority('outline')).toBe('important');
  expect(target.className).toBe('modal-trigger-test editor-added-class');
  expect(unrelated.style.cssText).toBe(unrelatedStyles);
  expect(
    document.querySelector('style[id^="modal-direct-highlight-style-"]')
  ).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
  cleanupAllHighlights();
  expect(target.style.cssText).toBe(originalStyles);
});

it('refreshes the highlight without replacing the original style snapshot', () => {
  const target = document.createElement('button');
  target.style.cssText = 'position: fixed; outline: 1px dotted green';
  document.body.append(target);
  const original = target.style.cssText;
  createDirectHighlight(target, 'first');
  createDirectHighlight(target, 'second');
  expect(
    document.querySelectorAll('style[id^="modal-direct-highlight-style-"]')
  ).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(1);
  cleanupAllHighlights();
  expect(target.style.cssText).toBe(original);
  expect(jest.getTimerCount()).toBe(0);
});

it('cleans up detached targets in an editor iframe and preserves existing highlight classes', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  const target = doc.createElement('button');
  target.className = 'modal-highlight-target';
  target.style.setProperty('z-index', '7', 'important');
  doc.body.append(target);
  createDirectHighlight(target, 'canvas');
  target.remove();
  cleanupAllHighlights();
  expect(target.style.zIndex).toBe('7');
  expect(target.style.getPropertyPriority('z-index')).toBe('important');
  expect(target.className).toBe('modal-highlight-target');
  expect(
    doc.querySelector('style[id^="modal-direct-highlight-style-"]')
  ).toBeNull();
});

it('never interpolates saved modal IDs into stylesheet source', () => {
  const target = document.createElement('button');
  document.body.append(target);
  const maliciousId = 'x{}body{opacity:0}@keyframes/**/injected';
  const info = createDirectHighlight(target, maliciousId)!;
  expect(info).not.toBeNull();
  expect(info.styleTag.textContent).not.toContain(maliciousId);
  expect(
    Array.from(info.styleTag.sheet!.cssRules).some(
      rule => rule instanceof CSSStyleRule && rule.selectorText === 'body'
    )
  ).toBe(false);
  expect(info.styleTag.id).toMatch(/^modal-direct-highlight-style-\d+$/);
});

it.each([true, false])(
  'honors reduced motion for scrolling (%s) and disables its pulse in CSS',
  reduced => {
    window.matchMedia = jest.fn(() => ({
      matches: reduced,
    })) as unknown as typeof window.matchMedia;
    const target = document.createElement('button');
    target.getBoundingClientRect = () =>
      ({ top: -100, bottom: -50, left: 0, right: 20 }) as DOMRect;
    target.scrollIntoView = jest.fn();
    document.body.append(target);
    const { styleTag } = createDirectHighlight(target, 'motion')!;
    jest.advanceTimersByTime(50);
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: reduced ? 'instant' : 'smooth',
      block: 'center',
    });
    const media = Array.from(styleTag.sheet!.cssRules).find(
      rule => rule instanceof CSSMediaRule
    ) as CSSMediaRule;
    expect(media.conditionText).toBe('(prefers-reduced-motion: reduce)');
    expect(media.cssRules[0].cssText).toContain('animation: none !important');
    expect(target.style.animation).toBe('');
  }
);
