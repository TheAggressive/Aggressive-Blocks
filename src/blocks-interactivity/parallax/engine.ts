/**
 * Shared frame engine for all parallax instances on a page.
 *
 * One scroll listener, one pointer listener, one orientation listener and
 * one requestAnimationFrame loop drive every container. The loop runs in
 * two phases — read all layout values first, then write all styles — so
 * multiple instances never interleave reads and writes (layout thrash).
 * It self-suspends as soon as scrolling stops and the smoothed pointer
 * settles, so an idle page costs zero main-thread time.
 *
 * Instances on the native scroll-timeline renderer (timeline.ts) only
 * pass through here once, to be primed; after that the browser animates
 * them and the scroll listener is not even attached for their sake
 * (debug mode excepted, which needs live progress readouts).
 *
 * @package Aggressive Apparel
 */

import type { CachedLayer } from './layers';
import { applyLayerFrame } from './transforms';
import type { ParallaxContext } from './types';
import {
  clamp,
  measureProgressGeometry,
  progressFromGeometry,
  type ProgressGeometry,
} from './utils';

export interface ParallaxInstance {
  /** Block wrapper element (interactivity root). */
  root: HTMLElement;
  /** Inner `__container` element that receives the 3D card tilt. */
  container: HTMLElement | null;
  ctx: ParallaxContext;
  layers: CachedLayer[];
  /**
   * `frame`: this engine writes layer styles every frame.
   * `timeline`: native scroll-driven animations own the layers; the
   * engine only primes the baseline (and feeds debug progress).
   */
  renderer: 'frame' | 'timeline';
  /** Toggled by the IntersectionObserver; inactive instances are skipped. */
  active: boolean;
  /** Baseline calibrated (happens on the first engine frame). */
  primed: boolean;
  /** Called in the write phase right after priming. */
  onPrimed?: () => void;
  /** Optional per-frame hook used by the (lazily loaded) debug tooling. */
  onFrame?: (progress: number) => void;

  // Engine-managed state below.
  /** Raw pointer target, -0.5..0.5. */
  pointerTargetX: number;
  pointerTargetY: number;
  /** Smoothed pointer, eased toward the target each frame. */
  pointerX: number;
  pointerY: number;
  progress: number;
  /**
   * Progress value at which every layer sits exactly where the editor
   * placed it (zero parallax offset). Calibrated once at init: blocks
   * already on screen at load use their load-time progress — so the
   * page renders exactly like the editor — while offscreen blocks use
   * 0.5 (layers rest at natural position mid-viewport).
   */
  baselineProgress: number;
  lastTiltX: number;
  lastTiltY: number;
  /**
   * Cached progress geometry — refreshed on resize, observer events, and
   * every GEOMETRY_REFRESH_FRAMES active frames. Keeps offset-chain walks
   * and boundary parsing out of the per-frame path.
   */
  geom: ProgressGeometry | null;
  framesSinceMeasure: number;
}

const POINTER_SETTLE_EPSILON = 0.0005;
const MAX_FRAME_DELTA_MS = 100;
/** Self-heal cadence for layout shifts the observers miss (~1s at 60Hz). */
const GEOMETRY_REFRESH_FRAMES = 60;

const instances = new Set<ParallaxInstance>();

let rafId: number | null = null;
let lastFrameTime = 0;
let listenersAttached = false;
let pointerListenersAttached = false;

/**
 * Device tilt → pointer mapping. Tilt is measured from a slowly
 * re-centering rest posture rather than from flat: phones are held at
 * ~30–60° of forward tilt, so mapping raw beta pinned the scene at its
 * maximum vertical offset. ±ORIENTATION_RANGE_DEG from rest spans the
 * full pointer range; changes under the deadband are sensor noise that
 * would otherwise keep the frame loop awake forever.
 */
const ORIENTATION_RANGE_DEG = 25;
const ORIENTATION_RECENTER = 0.02;
const ORIENTATION_DEADBAND = 0.004;
let orientationRest: { x: number; y: number } | null = null;
let orientationTarget = { x: 0, y: 0 };

const needsScrollFrames = (instance: ParallaxInstance): boolean =>
  instance.renderer === 'frame' || Boolean(instance.ctx.debugMode);

const hasFinePointer = (): boolean =>
  window.matchMedia('(pointer: fine)').matches;

const requestTick = (): void => {
  if (rafId === null) {
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
};

const handleScroll = (): void => {
  requestTick();
};

const handleResize = (): void => {
  // Viewport-relative boundary px and cached positions are stale now;
  // re-measured lazily on the next frame each instance renders.
  instances.forEach(instance => {
    instance.geom = null;
  });
  requestTick();
};

const handlePointerMove = (event: PointerEvent): void => {
  setPointerTargets(
    clamp(event.clientX / window.innerWidth - 0.5, -0.5, 0.5),
    clamp(event.clientY / window.innerHeight - 0.5, -0.5, 0.5)
  );
};

const setPointerTargets = (targetX: number, targetY: number): void => {
  let needsFrame = false;
  instances.forEach(instance => {
    if (instance.ctx.enableMouseInteraction) {
      instance.pointerTargetX = targetX;
      instance.pointerTargetY = targetY;
      needsFrame = true;
    }
  });
  if (needsFrame) {
    requestTick();
  }
};

/**
 * Device axes → screen axes for the current screen rotation, in degrees
 * (x: tilt toward the right edge, y: tilt toward the bottom edge).
 */
export const screenTilt = (
  beta: number,
  gamma: number,
  angle: number
): { x: number; y: number } => {
  switch (((angle % 360) + 360) % 360) {
    case 90:
      return { x: beta, y: -gamma };
    case 180:
      return { x: -gamma, y: -beta };
    case 270:
      return { x: -beta, y: gamma };
    default:
      return { x: gamma, y: beta };
  }
};

/** Current screen rotation; `window.orientation` covers iOS < 16.4. */
const screenAngle = (): number =>
  window.screen?.orientation?.angle ??
  (window as { orientation?: number }).orientation ??
  0;

const handleOrientation = (event: DeviceOrientationEvent): void => {
  if (event.beta === null || event.gamma === null) {
    return;
  }
  const tilt = screenTilt(event.beta, event.gamma, screenAngle());

  // Calibrate on the first reading, then drift toward the current
  // posture so leaning back on the couch doesn't pin the scene.
  if (!orientationRest) {
    orientationRest = { ...tilt };
  }
  orientationRest.x += (tilt.x - orientationRest.x) * ORIENTATION_RECENTER;
  orientationRest.y += (tilt.y - orientationRest.y) * ORIENTATION_RECENTER;

  const range = ORIENTATION_RANGE_DEG * 2;
  const targetX = clamp((tilt.x - orientationRest.x) / range, -0.5, 0.5);
  const targetY = clamp((tilt.y - orientationRest.y) / range, -0.5, 0.5);

  if (
    Math.abs(targetX - orientationTarget.x) < ORIENTATION_DEADBAND &&
    Math.abs(targetY - orientationTarget.y) < ORIENTATION_DEADBAND
  ) {
    return;
  }
  orientationTarget = { x: targetX, y: targetY };
  setPointerTargets(targetX, targetY);
};

const handleScreenRotation = (): void => {
  // Axes swap on rotation; re-calibrate from the next reading.
  orientationRest = null;
};

const attachPointerListeners = (): void => {
  if (pointerListenersAttached) {
    return;
  }
  pointerListenersAttached = true;

  // Exactly one pointer source, so a laptop with a motion sensor doesn't
  // have the mouse and the tilt fighting over the same target.
  if (hasFinePointer()) {
    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    return;
  }

  // Touch-first devices use device tilt. requestPermission() is never
  // called: it would pop a system dialog on a shopper's first tap (iOS),
  // and Chromium now exposes it too, so gating on its existence (as this
  // once did) silently disabled tilt everywhere. The listener is simply
  // attached — browsers that allow motion sensors (Android Chrome) deliver
  // events, browsers that gate them deliver none, at no cost.
  if (typeof window.DeviceOrientationEvent !== 'undefined') {
    window.addEventListener('deviceorientation', handleOrientation, {
      passive: true,
    });
    window.screen?.orientation?.addEventListener?.(
      'change',
      handleScreenRotation
    );
  }
};

const attachListeners = (): void => {
  if (listenersAttached) {
    return;
  }
  listenersAttached = true;
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleResize, { passive: true });
};

const detachScrollListeners = (): void => {
  if (listenersAttached) {
    window.removeEventListener('scroll', handleScroll);
    window.removeEventListener('resize', handleResize);
    listenersAttached = false;
  }
};

const detachPointerListeners = (): void => {
  if (pointerListenersAttached) {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('deviceorientation', handleOrientation);
    window.screen?.orientation?.removeEventListener?.(
      'change',
      handleScreenRotation
    );
    pointerListenersAttached = false;
    orientationRest = null;
  }
};

/**
 * Attach exactly the listeners the registered instances need, and drop
 * the rest — a page of timeline-rendered blocks carries no scroll
 * listener at all.
 */
const syncListeners = (): void => {
  let scroll = false;
  let pointer = false;
  instances.forEach(instance => {
    scroll ||= needsScrollFrames(instance);
    pointer ||= Boolean(instance.ctx.enableMouseInteraction);
  });

  if (scroll) {
    attachListeners();
  } else {
    detachScrollListeners();
  }
  if (pointer) {
    attachPointerListeners();
  } else {
    detachPointerListeners();
  }
};

/**
 * Ease the smoothed pointer toward its target. Frame-rate independent:
 * `alpha = 1 - e^(-dt/tau)` converges identically at 60Hz and 144Hz.
 * Returns true while the pointer is still in motion.
 */
const smoothPointer = (
  instance: ParallaxInstance,
  deltaMs: number
): boolean => {
  const tau = Math.max(instance.ctx.transitionDuration ?? 0.1, 0.016) * 1000;
  const alpha = 1 - Math.exp(-deltaMs / tau);

  const dx = instance.pointerTargetX - instance.pointerX;
  const dy = instance.pointerTargetY - instance.pointerY;

  if (
    Math.abs(dx) < POINTER_SETTLE_EPSILON &&
    Math.abs(dy) < POINTER_SETTLE_EPSILON
  ) {
    instance.pointerX = instance.pointerTargetX;
    instance.pointerY = instance.pointerTargetY;
    return false;
  }

  instance.pointerX += dx * alpha;
  instance.pointerY += dy * alpha;
  return true;
};

/**
 * Write the container's 3D card tilt from the smoothed pointer. The tilt
 * lives on a container WITHOUT `preserve-3d` and WITHOUT `will-change`
 * (see style.css) — both of those make Chromium hit-test descendant links
 * at a location that diverges from where they paint, which was the
 * "only a corner of the button is clickable" bug.
 */
const writeContainerTilt = (instance: ParallaxInstance): void => {
  const container = instance.container;
  if (!container) {
    return;
  }
  const maxRotation = instance.ctx.maxMouseRotation ?? 5;
  const tiltX = instance.pointerY * maxRotation * 2;
  const tiltY = -instance.pointerX * maxRotation * 2;

  if (
    Math.abs(tiltX - instance.lastTiltX) > 0.005 ||
    Math.abs(tiltY - instance.lastTiltY) > 0.005
  ) {
    instance.lastTiltX = tiltX;
    instance.lastTiltY = tiltY;
    container.style.setProperty(
      '--parallax-card-rotate-x',
      `${tiltX.toFixed(3)}deg`
    );
    container.style.setProperty(
      '--parallax-card-rotate-y',
      `${tiltY.toFixed(3)}deg`
    );
  }
};

/** Read-phase queries for one instance (no style writes). */
const readInstance = (instance: ParallaxInstance): void => {
  // Measure rarely; the per-frame path is pure arithmetic on scrollY.
  if (
    !instance.geom ||
    ++instance.framesSinceMeasure >= GEOMETRY_REFRESH_FRAMES
  ) {
    instance.geom = measureProgressGeometry(
      instance.root,
      instance.ctx.detectionBoundary
    );
    instance.framesSinceMeasure = 0;
  }

  const { progress } = progressFromGeometry(
    instance.geom,
    window.scrollY,
    window.innerHeight,
    instance.ctx.visibilityTrigger
  );
  instance.progress = progress;

  if (instance.renderer === 'frame' && instance.ctx.enableMouseInteraction) {
    instance.layers.forEach(layer => {
      if (layer.needsRect) {
        layer.rect = layer.element.getBoundingClientRect();
      }
    });
  }
};

/** Write-phase style application for one instance. */
const renderInstance = (instance: ParallaxInstance): void => {
  if (instance.renderer === 'timeline') {
    // The browser animates the layers; only debug wants the progress.
    instance.onFrame?.(instance.progress);
    return;
  }
  const is3D = Boolean(instance.ctx.enableMouseInteraction);
  if (is3D) {
    writeContainerTilt(instance);
  }

  const frame = {
    progress: instance.progress,
    baseline: instance.baselineProgress,
    pointerX: instance.pointerX,
    pointerY: instance.pointerY,
    is3D,
  };
  instance.layers.forEach(layer => applyLayerFrame(layer, frame, instance.ctx));
  instance.onFrame?.(instance.progress);
};

/**
 * Calibrate the baseline (read phase): blocks visible at load anchor to
 * their load-time progress so the page opens looking exactly like the
 * editor; offscreen blocks anchor to mid-viewport.
 */
const calibrateBaseline = (instance: ParallaxInstance): void => {
  readInstance(instance);
  const rect = instance.root.getBoundingClientRect();
  const inInitialViewport = rect.top < window.innerHeight && rect.bottom > 0;
  instance.baselineProgress = inInitialViewport ? instance.progress : 0.5;
};

const tick = (now: number): void => {
  rafId = null;
  const deltaMs = Math.min(now - lastFrameTime, MAX_FRAME_DELTA_MS);
  lastFrameTime = now;

  let pointerInMotion = false;
  const priming: ParallaxInstance[] = [];
  const rendering: ParallaxInstance[] = [];

  // READ phase: layout queries for every instance that needs them —
  // including all instances registered since the last frame, so N blocks
  // hydrating together cost one layout, not N forced ones.
  instances.forEach(instance => {
    if (!instance.primed) {
      calibrateBaseline(instance);
      priming.push(instance);
    } else if (instance.active && needsScrollFrames(instance)) {
      readInstance(instance);
      rendering.push(instance);
    }
  });

  // WRITE phase: priming renders, then pointer smoothing + styles.
  priming.forEach(instance => {
    instance.primed = true;
    renderInstance(instance);
    instance.onPrimed?.();
  });
  rendering.forEach(instance => {
    if (
      instance.ctx.enableMouseInteraction &&
      smoothPointer(instance, deltaMs)
    ) {
      pointerInMotion = true;
    }
    renderInstance(instance);
  });

  // Keep animating only while the pointer is still easing; scroll events
  // request their own ticks, so an idle page runs no frames at all.
  if (pointerInMotion) {
    rafId = requestAnimationFrame(tick);
  }
};

/**
 * Register an instance with the shared engine. It is primed on the next
 * engine frame (batched with any other new instances). Returns an
 * unregister callback; listeners are detached when no instance needs
 * them anymore.
 */
export const registerInstance = (instance: ParallaxInstance): (() => void) => {
  instances.add(instance);
  syncListeners();
  requestTick();

  return () => {
    instances.delete(instance);
    syncListeners();
    if (instances.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
};

/**
 * Move an instance onto the JS renderer — used when the native scroll
 * timeline could not start, so the block still animates.
 */
export const switchToFrameRenderer = (instance: ParallaxInstance): void => {
  instance.renderer = 'frame';
  syncListeners();
  // Render the primed frame now (progress was just measured), exactly as
  // a block that started on the JS renderer does — offscreen blocks get
  // their start state (e.g. faded out) before they scroll into view.
  if (instance.primed) {
    renderInstance(instance);
  }
  requestTick();
};

/**
 * Cheap geometry refresh from an IntersectionObserver entry rect — the
 * rect is free (no forced layout) and the root carries no transforms,
 * so it is layout-true. Keeps cached positions honest when images load
 * or content above the block shifts.
 */
export const refreshInstanceGeometry = (
  instance: ParallaxInstance,
  rect: DOMRectReadOnly
): void => {
  if (instance.geom) {
    instance.geom.docTop = rect.top + window.scrollY;
    instance.geom.elementHeight = rect.height;
    instance.framesSinceMeasure = 0;
  }
};

/** Mark an instance (in)active — called by its IntersectionObserver. */
export const setInstanceActive = (
  instance: ParallaxInstance,
  active: boolean
): void => {
  if (instance.active === active) {
    return;
  }
  instance.active = active;
  instance.root.classList.toggle(
    'aggressive-apparel-parallax--intersecting',
    active
  );
  if (active) {
    requestTick();
  } else if (instance.primed && needsScrollFrames(instance)) {
    // Render one last settled frame so layers freeze at their clamped
    // end position (0 or 1) instead of wherever a fast scroll left them.
    instance.pointerX = instance.pointerTargetX;
    instance.pointerY = instance.pointerTargetY;
    readInstance(instance);
    renderInstance(instance);
  }
};

/** Build a fresh engine instance record for a container. */
export const createInstance = (
  root: HTMLElement,
  container: HTMLElement | null,
  ctx: ParallaxContext,
  layers: CachedLayer[],
  renderer: ParallaxInstance['renderer'] = 'frame'
): ParallaxInstance => ({
  root,
  container,
  ctx,
  layers,
  renderer,
  active: false,
  primed: false,
  pointerTargetX: 0,
  pointerTargetY: 0,
  pointerX: 0,
  pointerY: 0,
  progress: 0,
  baselineProgress: 0.5,
  lastTiltX: 0,
  lastTiltY: 0,
  geom: null,
  framesSinceMeasure: 0,
});
