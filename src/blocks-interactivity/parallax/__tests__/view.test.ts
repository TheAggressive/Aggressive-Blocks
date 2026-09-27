/**
 * Front-end entry: renderer selection, fallback, reduced motion, the
 * mobile opt-out, and clean teardown — driven through the real
 * `initParallax` callback with the Interactivity API mocked.
 *
 * @jest-environment jsdom
 */

import type { ParallaxContext } from '../types';

type InitCallback = () => (() => void) | undefined;

const mockState: {
  ctx: Partial<ParallaxContext> | null;
  ref: HTMLElement | null;
  callbacks: { initParallax?: InitCallback };
} = { ctx: null, ref: null, callbacks: {} };

jest.mock(
  '@wordpress/interactivity',
  () => ({
    store: (
      _ns: string,
      definition: { callbacks: { initParallax: InitCallback } }
    ) => {
      mockState.callbacks = definition.callbacks;
      return definition;
    },
    getContext: () => mockState.ctx,
    getElement: () => ({ ref: mockState.ref }),
  }),
  { virtual: true }
); // WordPress provides the module at runtime.

// Registers the store (captures initParallax). Loaded after the mock
// state above exists — a static import would be hoisted before it.
beforeAll(async () => {
  await import('../view');
});

let rafQueue: FrameRequestCallback[] = [];
const flushFrames = (limit = 5): void => {
  for (let i = 0; i < limit && rafQueue.length; i++) {
    const queue = rafQueue;
    rafQueue = [];
    queue.forEach(cb => cb(performance.now()));
  }
};

/** matchMedia with change listeners we can fire. */
const media: Record<
  string,
  { matches: boolean; listeners: Array<() => void> }
> = {};
const setMedia = (query: string, matches: boolean): void => {
  media[query] ??= { matches, listeners: [] };
  media[query].matches = matches;
  media[query].listeners.forEach(listener => listener());
};

const observers: Array<{
  disconnect: jest.Mock;
  options: IntersectionObserverInit;
  callback: IntersectionObserverCallback;
}> = [];

const REDUCED = '(prefers-reduced-motion: reduce)';
const MOBILE = '(max-width: 768px)';

beforeEach(() => {
  rafQueue = [];
  observers.length = 0;
  Object.keys(media).forEach(key => delete media[key]);
  window.requestAnimationFrame = cb => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  window.cancelAnimationFrame = () => {
    rafQueue = [];
  };
  window.matchMedia = jest.fn((query: string) => {
    media[query] ??= { matches: false, listeners: [] };
    const entry = media[query];
    return {
      get matches() {
        return entry.matches;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) =>
        entry.listeners.push(listener),
      removeEventListener: (_: string, listener: () => void) => {
        entry.listeners = entry.listeners.filter(l => l !== listener);
      },
    };
  }) as unknown as typeof window.matchMedia;
  (window as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    disconnect = jest.fn();
    constructor(
      callback: IntersectionObserverCallback,
      options: IntersectionObserverInit
    ) {
      observers.push({ disconnect: this.disconnect, options, callback });
    }
    observe(): void {}
  };
  (globalThis as { CSS?: unknown }).CSS = { supports: () => true };
});

/** Cleanups for every mount — run even when a test fails midway. */
const mounted: Array<() => void> = [];

afterEach(() => {
  // Idempotent: tests may already have called cleanup themselves.
  mounted.splice(0).forEach(cleanup => cleanup());
  document.body.innerHTML = '';
  delete (globalThis as { ViewTimeline?: unknown }).ViewTimeline;
});

const mountBlock = (
  ctx: Partial<ParallaxContext> = {}
): { root: HTMLElement; layer: HTMLElement; cleanup: () => void } => {
  const root = document.createElement('div');
  root.className = 'aggressive-apparel-parallax';
  root.innerHTML =
    '<div class="aggressive-apparel-parallax__container"><div class="aggressive-apparel-parallax__content">' +
    '<p data-parallax-enabled="true" data-parallax-depth="50" style="background-color: rgb(1, 2, 3)">Layer</p>' +
    '</div></div>';
  document.body.appendChild(root);
  mockState.ref = root;
  mockState.ctx = { intensity: 60, ...ctx };
  const cleanup = mockState.callbacks.initParallax!() ?? (() => {});
  mounted.push(cleanup);
  return {
    root,
    layer: root.querySelector<HTMLElement>('[data-parallax-enabled]')!,
    cleanup,
  };
};

describe('renderer selection', () => {
  it('uses the JS engine where scroll timelines are unavailable', () => {
    const { root, layer, cleanup } = mountBlock();
    flushFrames();
    expect(
      root.classList.contains('aggressive-apparel-parallax--initialized')
    ).toBe(true);
    expect(
      root.classList.contains('aggressive-apparel-parallax--scroll-timeline')
    ).toBe(false);
    expect(layer.style.translate).not.toBe('');
    cleanup();
  });

  it('hands layers to native scroll-driven animations when supported', () => {
    (globalThis as { ViewTimeline?: unknown }).ViewTimeline = class {};
    const animation = { cancel: jest.fn() };
    const animate = jest.fn(() => animation);
    HTMLElement.prototype.animate =
      animate as unknown as HTMLElement['animate'];

    const { root, layer, cleanup } = mountBlock();
    flushFrames();

    expect(
      root.classList.contains('aggressive-apparel-parallax--scroll-timeline')
    ).toBe(true);
    expect(animate).toHaveBeenCalled();
    // The browser animates; the engine never writes inline motion.
    expect(layer.style.translate).toBe('');

    cleanup();
    expect(animation.cancel).toHaveBeenCalled();
    expect(
      root.classList.contains('aggressive-apparel-parallax--scroll-timeline')
    ).toBe(false);
  });

  it('falls back to the JS engine when native animations fail to start', () => {
    (globalThis as { ViewTimeline?: unknown }).ViewTimeline = class {};
    HTMLElement.prototype.animate = jest.fn(() => {
      throw new TypeError('unsupported range');
    }) as unknown as HTMLElement['animate'];

    const { root, layer, cleanup } = mountBlock();
    flushFrames();

    expect(
      root.classList.contains('aggressive-apparel-parallax--scroll-timeline')
    ).toBe(false);
    expect(layer.style.translate).not.toBe('');
    // Matcher from @wordpress/jest-console (wp-scripts preset; untyped).
    (expect(console) as unknown as { toHaveWarned: () => void }).toHaveWarned();
    cleanup();
  });

  it('keeps 3D pointer mode on the JS engine even with timeline support', () => {
    (globalThis as { ViewTimeline?: unknown }).ViewTimeline = class {};
    const animate = jest.fn();
    HTMLElement.prototype.animate =
      animate as unknown as HTMLElement['animate'];

    const { root, cleanup } = mountBlock({ enableMouseInteraction: true });
    flushFrames();

    expect(animate).not.toHaveBeenCalled();
    expect(
      root.classList.contains('aggressive-apparel-parallax--scroll-timeline')
    ).toBe(false);
    cleanup();
  });
});

describe('activation', () => {
  it('observes with a zero threshold inside the buffered zone', () => {
    const { cleanup } = mountBlock({ activationBuffer: 20 });
    expect(observers[0].options.threshold).toEqual([0]);
    expect(observers[0].options.rootMargin).toBe('20% 0% 20% 0%');
    cleanup();
  });

  it('toggles the block active from observer entries', () => {
    const { root } = mountBlock();
    flushFrames();
    const fire = (isIntersecting: boolean): void =>
      observers[0].callback(
        [
          {
            isIntersecting,
            intersectionRatio: isIntersecting ? 0.1 : 0,
            boundingClientRect: new DOMRect(0, 900, 800, 400),
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      );

    // Any overlap activates — even a sliver far below the trigger ratio.
    fire(true);
    expect(root.classList).toContain(
      'aggressive-apparel-parallax--intersecting'
    );
    fire(false);
    expect(root.classList).not.toContain(
      'aggressive-apparel-parallax--intersecting'
    );
  });
});

describe('reduced motion', () => {
  it('never starts when reduced motion is preferred at load', () => {
    setMedia(REDUCED, true);
    const { root, layer, cleanup } = mountBlock();
    flushFrames();
    expect(
      root.classList.contains('aggressive-apparel-parallax--initialized')
    ).toBe(false);
    expect(observers).toHaveLength(0);
    expect(layer.style.translate).toBe('');
    cleanup();
  });

  it('stops mid-visit and restores the author styles exactly', () => {
    const { root, layer, cleanup } = mountBlock();
    flushFrames();
    expect(layer.style.translate).not.toBe('');

    setMedia(REDUCED, true);

    expect(
      root.classList.contains('aggressive-apparel-parallax--initialized')
    ).toBe(false);
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(layer.style.translate).toBe('');
    expect(layer.style.zIndex).toBe('');
    expect(layer.style.backgroundColor).toBe('rgb(1, 2, 3)');

    // And comes back when the preference is lifted.
    setMedia(REDUCED, false);
    flushFrames();
    expect(
      root.classList.contains('aggressive-apparel-parallax--initialized')
    ).toBe(true);
    cleanup();
  });
});

describe('disable on mobile', () => {
  it('stays off below the breakpoint and starts when widened', () => {
    setMedia(MOBILE, true);
    const { root, cleanup } = mountBlock({ disableOnMobile: true });
    expect(
      root.classList.contains('aggressive-apparel-parallax--initialized')
    ).toBe(false);

    setMedia(MOBILE, false);
    expect(
      root.classList.contains('aggressive-apparel-parallax--initialized')
    ).toBe(true);
    cleanup();
  });

  it('ignores the breakpoint when the block has not opted out', () => {
    setMedia(MOBILE, true);
    const { root, cleanup } = mountBlock();
    expect(
      root.classList.contains('aggressive-apparel-parallax--initialized')
    ).toBe(true);
    cleanup();
  });
});

describe('teardown', () => {
  it('removes every listener it added', () => {
    const { cleanup } = mountBlock();
    expect(media[REDUCED].listeners).toHaveLength(1);
    cleanup();
    expect(media[REDUCED].listeners).toHaveLength(0);
    expect(media[MOBILE].listeners).toHaveLength(0);
  });
});
