/**
 * Shared frame engine: batched priming, listener lifecycle per renderer,
 * device-tilt calibration, and the idle guarantee.
 *
 * Each test loads a fresh copy of the engine (it keeps module state) and
 * drives requestAnimationFrame by hand.
 *
 * @jest-environment jsdom
 */

import { applyParallaxDefaults } from '../config';
import type * as EngineModule from '../engine';
import { collectLayers } from '../layers';
import type { ParallaxContext } from '../types';

type Engine = typeof EngineModule;

let rafQueue: FrameRequestCallback[] = [];
let now = 0;

/** Run queued frames until the engine stops asking (or `limit` hit). */
const flushFrames = (limit = 1): number => {
  let ran = 0;
  while (rafQueue.length && ran < limit) {
    const queue = rafQueue;
    rafQueue = [];
    now += 16;
    queue.forEach(cb => cb(now));
    ran++;
  }
  return ran;
};

/** Unregister callbacks, so no engine copy leaks listeners into the next test. */
let cleanups: Array<() => void> = [];

const loadEngine = (): Engine => {
  let engine!: Engine;
  jest.isolateModules(() => {
    engine = jest.requireActual('../engine');
  });
  const register = engine.registerInstance;
  return {
    ...engine,
    registerInstance: instance => {
      const unregister = register(instance);
      cleanups.push(unregister);
      return unregister;
    },
  };
};

const mockMatchMedia = (matches: (query: string) => boolean): void => {
  window.matchMedia = jest.fn((query: string) => ({
    matches: matches(query),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
};

const buildInstance = (
  engine: Engine,
  ctxOverrides: Partial<ParallaxContext> = {},
  renderer: 'frame' | 'timeline' = 'frame'
) => {
  const ctx = applyParallaxDefaults(ctxOverrides);
  const root = document.createElement('div');
  const layerEl = document.createElement('div');
  layerEl.setAttribute('data-parallax-enabled', 'true');
  layerEl.setAttribute('data-parallax-depth', '50');
  root.appendChild(layerEl);
  document.body.appendChild(root);
  const layers = collectLayers(root, ctx);
  const instance = engine.createInstance(root, null, ctx, layers, renderer);
  return { instance, root, layerEl, ctx };
};

beforeEach(() => {
  rafQueue = [];
  now = 0;
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  window.cancelAnimationFrame = jest.fn(() => {
    rafQueue = [];
  });
  mockMatchMedia(() => false);
});

afterEach(() => {
  cleanups.forEach(cleanup => cleanup());
  cleanups = [];
  document.body.innerHTML = '';
  jest.restoreAllMocks();
  delete (window as { DeviceOrientationEvent?: unknown })
    .DeviceOrientationEvent;
});

describe('priming', () => {
  it('primes every newly registered instance in one shared frame', () => {
    const engine = loadEngine();
    const a = buildInstance(engine);
    const b = buildInstance(engine);
    const rectA = jest.spyOn(a.root, 'getBoundingClientRect');
    const rectB = jest.spyOn(b.root, 'getBoundingClientRect');

    engine.registerInstance(a.instance);
    engine.registerInstance(b.instance);

    // Nothing measured or written synchronously during hydration.
    expect(rectA).not.toHaveBeenCalled();
    expect(a.layerEl.style.translate).toBe('');
    expect(rafQueue).toHaveLength(1);

    flushFrames();
    expect(a.instance.primed).toBe(true);
    expect(b.instance.primed).toBe(true);
    expect(rectA).toHaveBeenCalledTimes(1);
    expect(rectB).toHaveBeenCalledTimes(1);
    expect(a.layerEl.style.translate).not.toBe('');
  });

  it('anchors a block visible at load to its load-time progress', () => {
    const engine = loadEngine();
    const { instance, root, layerEl } = buildInstance(engine);
    jest
      .spyOn(root, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 100, 800, 400));
    Object.defineProperty(root, 'offsetTop', { value: 100 });
    Object.defineProperty(root, 'offsetHeight', { value: 400 });

    engine.registerInstance(instance);
    flushFrames();

    expect(instance.baselineProgress).toBe(instance.progress);
    expect(instance.baselineProgress).not.toBe(0.5);
    // Zero offset at the baseline: the page opens looking like the editor.
    expect(layerEl.style.translate).toBe('0.00px 0.00px');
  });

  it('anchors an offscreen block to mid-viewport', () => {
    const engine = loadEngine();
    const { instance } = buildInstance(engine);
    engine.registerInstance(instance);
    flushFrames();
    expect(instance.baselineProgress).toBe(0.5);
  });

  it('hands timeline instances to onPrimed without writing layer styles', () => {
    const engine = loadEngine();
    const { instance, layerEl } = buildInstance(engine, {}, 'timeline');
    const onPrimed = jest.fn();
    instance.onPrimed = onPrimed;

    engine.registerInstance(instance);
    flushFrames();

    expect(onPrimed).toHaveBeenCalledTimes(1);
    expect(layerEl.style.translate).toBe('');
  });

  it('does not render a settle frame for an instance not yet primed', () => {
    const engine = loadEngine();
    const { instance, layerEl } = buildInstance(engine);
    engine.registerInstance(instance);
    instance.active = true;
    engine.setInstanceActive(instance, false);
    expect(layerEl.style.translate).toBe('');
  });
});

describe('listener lifecycle', () => {
  const scrollListeners = (spy: jest.SpyInstance): number =>
    spy.mock.calls.filter(([type]) => type === 'scroll').length;

  it('attaches no scroll listener for timeline-rendered blocks', () => {
    const engine = loadEngine();
    const add = jest.spyOn(window, 'addEventListener');
    const { instance } = buildInstance(engine, {}, 'timeline');
    engine.registerInstance(instance);
    expect(scrollListeners(add)).toBe(0);
  });

  it('attaches scroll + resize for JS-rendered blocks and drops them after', () => {
    const engine = loadEngine();
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const { instance } = buildInstance(engine);

    const unregister = engine.registerInstance(instance);
    expect(scrollListeners(add)).toBe(1);
    expect(add).toHaveBeenCalledWith('resize', expect.any(Function), {
      passive: true,
    });

    unregister();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('shares one listener across many instances', () => {
    const engine = loadEngine();
    const add = jest.spyOn(window, 'addEventListener');
    engine.registerInstance(buildInstance(engine).instance);
    engine.registerInstance(buildInstance(engine).instance);
    engine.registerInstance(buildInstance(engine).instance);
    expect(scrollListeners(add)).toBe(1);
  });

  it('keeps progress readouts alive for a debugged timeline block', () => {
    const engine = loadEngine();
    const add = jest.spyOn(window, 'addEventListener');
    const { instance } = buildInstance(engine, { debugMode: true }, 'timeline');
    engine.registerInstance(instance);
    expect(scrollListeners(add)).toBe(1);
  });

  it('switches a failed timeline block onto the JS renderer', () => {
    const engine = loadEngine();
    const add = jest.spyOn(window, 'addEventListener');
    const { instance, layerEl } = buildInstance(engine, {}, 'timeline');
    engine.registerInstance(instance);
    flushFrames();

    engine.switchToFrameRenderer(instance);
    expect(instance.renderer).toBe('frame');
    expect(scrollListeners(add)).toBe(1);
    // Rendered immediately, not a frame later.
    expect(layerEl.style.translate).not.toBe('');
  });

  it('runs no frames on an idle page', () => {
    const engine = loadEngine();
    const { instance } = buildInstance(engine);
    engine.registerInstance(instance);
    flushFrames();
    expect(rafQueue).toHaveLength(0);

    window.dispatchEvent(new Event('scroll'));
    expect(rafQueue).toHaveLength(1);
    flushFrames();
    expect(rafQueue).toHaveLength(0);
  });
});

describe('pointer', () => {
  it('eases toward the pointer and then stops requesting frames', () => {
    mockMatchMedia(query => query === '(pointer: fine)');
    const engine = loadEngine();
    const { instance } = buildInstance(engine, {
      enableMouseInteraction: true,
      transitionDuration: 0.1,
    });
    engine.registerInstance(instance);
    flushFrames();
    instance.active = true;

    window.dispatchEvent(
      Object.assign(new Event('pointermove'), {
        clientX: window.innerWidth,
        clientY: window.innerHeight / 2,
      })
    );
    const frames = flushFrames(500);

    expect(frames).toBeLessThan(500);
    expect(rafQueue).toHaveLength(0);
    expect(instance.pointerX).toBe(0.5);
  });
});

describe('device tilt', () => {
  const tilt = (beta: number, gamma: number): void => {
    window.dispatchEvent(
      Object.assign(new Event('deviceorientation'), { beta, gamma })
    );
  };

  const setup = () => {
    // Stub mirrors current browsers: requestPermission exists (Chromium
    // and iOS). It must never be called — that would prompt shoppers.
    const requestPermission = jest.fn(() => Promise.resolve('prompt'));
    (window as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent =
      Object.assign(class {}, { requestPermission });
    const engine = loadEngine();
    const { instance } = buildInstance(engine, {
      enableMouseInteraction: true,
    });
    engine.registerInstance(instance);
    flushFrames();
    return { engine, instance, requestPermission };
  };

  it('listens on touch devices even where requestPermission exists', () => {
    // Regression: the listener was skipped whenever requestPermission
    // existed — which Chromium now exposes — so tilt never worked.
    const { instance, requestPermission } = setup();
    tilt(45, 0);
    tilt(60, 0);
    expect(instance.pointerTargetY).toBeGreaterThan(0);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('uses only the mouse on fine-pointer devices', () => {
    mockMatchMedia(query => query === '(pointer: fine)');
    const { instance } = setup();
    tilt(45, 0);
    tilt(80, 0);
    expect(instance.pointerTargetY).toBe(0);
  });

  it('treats the posture the phone is held in as center', () => {
    // Regression: raw beta (~45° when held) pinned the scene at max tilt.
    const { instance } = setup();
    tilt(45, 0);
    expect(instance.pointerTargetY).toBe(0);
    expect(instance.pointerTargetX).toBe(0);
  });

  it('responds to tilt relative to that posture', () => {
    const { instance } = setup();
    tilt(45, 0);
    tilt(55, -5);
    expect(instance.pointerTargetY).toBeGreaterThan(0.15);
    expect(instance.pointerTargetX).toBeLessThan(-0.05);
  });

  it('ignores sensor noise so the loop can go idle', () => {
    const { instance } = setup();
    tilt(45, 0);
    tilt(55, 0);
    flushFrames(500);
    const settled = instance.pointerTargetY;

    tilt(55.05, 0.02);
    expect(instance.pointerTargetY).toBe(settled);
    expect(rafQueue).toHaveLength(0);
  });

  it('clamps extreme tilt to the pointer range', () => {
    const { instance } = setup();
    tilt(0, 0);
    tilt(170, 0);
    expect(instance.pointerTargetY).toBe(0.5);
  });
});
