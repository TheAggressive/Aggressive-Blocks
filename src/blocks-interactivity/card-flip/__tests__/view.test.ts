/**
 * Tests for the card-flip face accessibility syncing.
 *
 * @jest-environment jsdom
 */

jest.mock(
  '@wordpress/interactivity',
  () => ({
    store: () => ({}),
    getContext: () => ({}),
    getElement: () => ({ ref: null }),
  }),
  { virtual: true }
);

import { applyFaceInert, isHoverPointer } from '../view';

const CARD = [
  '<button class="aa-card-flip__toggle" type="button"></button>',
  '<div class="aa-card-flip__inner">',
  '<div class="aa-card-flip__face aa-card-flip__face--front"><a href="#f">front</a></div>',
  '<div class="aa-card-flip__face aa-card-flip__face--back"><a href="#b">back</a></div>',
  '</div>',
].join('');

function buildCard(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'aa-card-flip';
  root.innerHTML = CARD;
  document.body.appendChild(root);
  return root;
}

const face = (r: HTMLElement, side: 'front' | 'back') =>
  r.querySelector(
    `:scope > .aa-card-flip__inner > .aa-card-flip__face--${side}`
  ) as HTMLElement;
const front = (r: HTMLElement) => face(r, 'front');
const back = (r: HTMLElement) => face(r, 'back');

afterEach(() => {
  document.body.innerHTML = '';
});

describe('applyFaceInert', () => {
  it('inerts the back while showing the front (not flipped)', () => {
    const root = buildCard();
    applyFaceInert(root, false);

    expect(front(root).hasAttribute('inert')).toBe(false);
    expect(back(root).hasAttribute('inert')).toBe(true);
  });

  it('inerts the front while showing the back (flipped)', () => {
    const root = buildCard();
    applyFaceInert(root, true);

    expect(front(root).hasAttribute('inert')).toBe(true);
    expect(back(root).hasAttribute('inert')).toBe(false);
  });

  it('flips the inert side back and forth on repeated calls', () => {
    const root = buildCard();

    applyFaceInert(root, true);
    applyFaceInert(root, false);

    expect(front(root).hasAttribute('inert')).toBe(false);
    expect(back(root).hasAttribute('inert')).toBe(true);
  });

  it('does not throw when a face is missing', () => {
    const root = buildCard();
    back(root).remove();

    expect(() => applyFaceInert(root, true)).not.toThrow();
    expect(front(root).hasAttribute('inert')).toBe(true);
  });

  it('leaves a card nested inside a face alone', () => {
    const root = buildCard();
    const nested = document.createElement('div');
    nested.className = 'aa-card-flip';
    nested.innerHTML = CARD;
    front(root).appendChild(nested);

    applyFaceInert(root, true);

    expect(back(root).hasAttribute('inert')).toBe(false);
    expect(front(nested).hasAttribute('inert')).toBe(false);
    expect(back(nested).hasAttribute('inert')).toBe(false);
  });

  it('moves focus to the flip control when the focused face turns away', () => {
    const root = buildCard();
    applyFaceInert(root, true);
    back(root).querySelector('a')!.focus();

    applyFaceInert(root, false);

    expect(document.activeElement).toBe(
      root.querySelector('.aa-card-flip__toggle')
    );
  });

  it('leaves focus alone when it is outside the face turning away', () => {
    const root = buildCard();
    const link = front(root).querySelector('a')!;
    link.focus();

    applyFaceInert(root, false);

    expect(document.activeElement).toBe(link);
  });
});

describe('isHoverPointer', () => {
  const pointer = (pointerType: string) => ({ pointerType }) as PointerEvent;

  it('follows a mouse', () => {
    expect(isHoverPointer(pointer('mouse'))).toBe(true);
  });

  it('ignores touch and pen, which fire pointerenter on tap', () => {
    expect(isHoverPointer(pointer('touch'))).toBe(false);
    expect(isHoverPointer(pointer('pen'))).toBe(false);
  });
});
