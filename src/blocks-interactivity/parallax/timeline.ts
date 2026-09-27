/**
 * Native scroll-driven renderer for the Parallax block.
 *
 * Where the browser supports `ViewTimeline`, each layer's scroll motion
 * and effects become a Web Animation bound to the block's view timeline.
 * The browser then runs them itself: no scroll listener, no per-frame
 * JavaScript, no layout reads, and transform/opacity/filter changes run
 * on the compositor thread. The JS frame engine (engine.ts) remains the
 * fallback for browsers without scroll-driven animations and for 3D
 * pointer mode (see `canUseScrollTimeline`).
 *
 * Parity: keyframes are sampled from the same `computeScrollFrame()` the
 * JS engine evaluates each frame, and the timeline range is the exact
 * equivalent of `progressFromGeometry()`:
 *   - Detection Boundary → view-timeline inset (negated: a boundary
 *     widens the zone, an inset narrows the scrollport);
 *   - visibilityTrigger → `entry-crossing <trigger>%` — the subject's
 *     own height, like the JS `elementHeight * visibilityTrigger`
 *     (`entry` would be wrong: its length is capped at the scrollport
 *     height for sections taller than the viewport);
 *   - exit → `cover 100%` (bottom edge leaves the widened top).
 *
 * @package Aggressive Apparel
 */

import type { CachedLayer } from './layers';
import { computeScrollFrame } from './transforms';
import type { DetectionBoundary, ParallaxContext } from './types';
import { ParallaxLogger, parseBoundaryPart } from './utils';

type ViewTimelineConstructor = new (options: {
  subject: Element;
  axis?: 'block' | 'inline' | 'x' | 'y';
  inset?: string;
}) => AnimationTimeline;

type TimelineAnimationOptions = KeyframeAnimationOptions & {
  timeline: AnimationTimeline;
  rangeStart: string;
  rangeEnd: string;
};

/** Evenly spaced samples per keyframe set (plus effect breakpoints). */
const BASE_SAMPLES = 32;

/** Properties that force main-thread paint; animated separately. */
const PAINT_PROPS = new Set([
  'backgroundColor',
  'color',
  'borderColor',
  'boxShadow',
  'textShadow',
]);

/** Identity values a keyframe set can drop when they never change. */
const IDENTITY: Record<string, string> = {
  translate: '0.00px 0.00px',
  scale: '1.0000',
};

const getViewTimeline = (): ViewTimelineConstructor | null => {
  const ctor = (globalThis as { ViewTimeline?: unknown }).ViewTimeline;
  return typeof ctor === 'function' ? (ctor as ViewTimelineConstructor) : null;
};

/** True when the browser can run view-timeline animations with ranges. */
export const supportsScrollTimeline = (): boolean =>
  getViewTimeline() !== null &&
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-range', 'entry-crossing 0% cover 100%');

const OVERFLOW_SCROLLS = /\b(auto|scroll|hidden|overlay)\b/;

const isScrollContainer = (element: Element): boolean => {
  const style = getComputedStyle(element);
  return OVERFLOW_SCROLLS.test(`${style.overflowX} ${style.overflowY}`);
};

/**
 * True when the block scrolls with the page viewport — the scroller the
 * JS engine measures against. A view timeline binds to the NEAREST
 * scroll container; if an ancestor is one (e.g. a theme that sets
 * `overflow-x: hidden` on both html and body, turning body into a
 * scroller that never scrolls), the timeline would never advance. Those
 * layouts keep the JS engine, preserving today's behavior.
 */
export const scrollsWithViewport = (root: HTMLElement): boolean => {
  const html = document.documentElement;
  const body = document.body;
  for (let el = root.parentElement; el && el !== html; el = el.parentElement) {
    if (el === body) {
      // body's overflow propagates to the viewport unless <html> has its
      // own non-visible overflow; only then is body a real scroller.
      if (isScrollContainer(body) && isScrollContainer(html)) {
        return false;
      }
      continue;
    }
    if (isScrollContainer(el)) {
      return false;
    }
  }
  return true;
};

/**
 * Whether this block should use the native renderer. 3D pointer mode
 * stays on the JS engine: it needs per-frame JS for the pointer anyway,
 * and compositor-promoted layers under the tilted container are
 * hit-tested at their flat 2D bounds (see style.css).
 */
export const canUseScrollTimeline = (
  root: HTMLElement,
  ctx: ParallaxContext
): boolean =>
  !ctx.enableMouseInteraction &&
  supportsScrollTimeline() &&
  scrollsWithViewport(root);

/** Detection Boundary → `view-timeline-inset` (top then bottom). */
export const viewTimelineInset = (boundary: DetectionBoundary): string => {
  const outset = (value: string | undefined): string => {
    const part = parseBoundaryPart(value);
    return part && part.value !== 0 ? `${-part.value}${part.unit}` : '0px';
  };
  return `${outset(boundary.top)} ${outset(boundary.bottom)}`;
};

/** `entry-crossing` offset equivalent to the JS trigger offset. */
export const timelineRangeStart = (visibilityTrigger: number): string => {
  const trigger = Number.isFinite(visibilityTrigger) ? visibilityTrigger : 0;
  return `entry-crossing ${+(trigger * 100).toFixed(4)}%`;
};

type EffectWindow = {
  enabled?: boolean;
  effectStart?: number;
  effectEnd?: number;
};

/**
 * Progress values where an effect curve has a corner (window start/end
 * and the midpoint where peek/reverse/fade-range curves turn). Sampling
 * exactly there keeps piecewise curves exact between linear keyframes.
 */
const effectBreakpoints = (layer: CachedLayer): number[] => {
  const { effects } = layer;
  const windows: Array<EffectWindow | undefined> = [
    effects.scrollOpacity,
    effects.blur,
    effects.colorTransition,
    effects.dynamicShadow,
    effects.rotation,
  ];
  const points: number[] = [];
  windows.forEach(effect => {
    if (!effect?.enabled) {
      return;
    }
    const start = effect.effectStart ?? 0;
    const end = effect.effectEnd ?? 0.25;
    points.push(start, end, (start + end) / 2);
  });
  return points;
};

export const sampleOffsets = (layer: CachedLayer): number[] => {
  const offsets = new Set<number>();
  for (let i = 0; i <= BASE_SAMPLES; i++) {
    offsets.add(i / BASE_SAMPLES);
  }
  effectBreakpoints(layer).forEach(point => {
    if (Number.isFinite(point) && point > 0 && point < 1) {
      offsets.add(Math.round(point * 1e4) / 1e4);
    }
  });
  return [...offsets].sort((a, b) => a - b);
};

/** Drop properties that sit at their identity value the whole way. */
const pruneKeyframes = (keyframes: Keyframe[]): Keyframe[] | null => {
  const props = new Set<string>();
  keyframes.forEach(frame =>
    Object.keys(frame).forEach(key => key !== 'offset' && props.add(key))
  );
  props.forEach(prop => {
    const identity = IDENTITY[prop];
    if (
      identity !== undefined &&
      keyframes.every(frame => frame[prop] === identity)
    ) {
      keyframes.forEach(frame => delete frame[prop]);
      props.delete(prop);
    }
  });
  return props.size ? keyframes : null;
};

/**
 * Sample a layer's scroll appearance into keyframe sets: one the
 * compositor can run (translate/scale/rotate/opacity/filter) and one for
 * paint-only properties (colors/shadows). A single paint property would
 * otherwise force the whole animation onto the main thread.
 */
export const buildLayerKeyframes = (
  layer: CachedLayer,
  baseline: number,
  ctx: ParallaxContext
): { composited: Keyframe[] | null; paint: Keyframe[] | null } => {
  const composited: Keyframe[] = [];
  const paint: Keyframe[] = [];

  sampleOffsets(layer).forEach(offset => {
    const frame = computeScrollFrame(layer, offset, baseline, ctx);
    const main: Keyframe = {
      offset,
      translate: `${frame.x.toFixed(2)}px ${frame.y.toFixed(2)}px`,
      scale: frame.scale.toFixed(4),
    };
    const painted: Keyframe = { offset };
    Object.entries(frame.styles).forEach(([prop, value]) => {
      (PAINT_PROPS.has(prop) ? painted : main)[prop] = value;
    });
    composited.push(main);
    paint.push(painted);
  });

  return {
    composited: pruneKeyframes(composited),
    paint: pruneKeyframes(paint),
  };
};

/**
 * Start native scroll-driven animations for every layer. Returns the
 * running animations, or null when anything fails — the caller then
 * falls back to the JS engine, so a browser quirk never leaves layers
 * half-animated.
 */
export const startTimelineAnimations = (
  root: HTMLElement,
  layers: CachedLayer[],
  ctx: ParallaxContext,
  baseline: number
): Animation[] | null => {
  const ViewTimeline = getViewTimeline();
  if (!ViewTimeline) {
    return null;
  }

  const animations: Animation[] = [];
  try {
    const options: TimelineAnimationOptions = {
      timeline: new ViewTimeline({
        subject: root,
        axis: 'block',
        inset: viewTimelineInset(ctx.detectionBoundary),
      }),
      rangeStart: timelineRangeStart(ctx.visibilityTrigger),
      rangeEnd: 'cover 100%',
      fill: 'both',
      easing: 'linear',
    };

    layers.forEach(layer => {
      const { composited, paint } = buildLayerKeyframes(layer, baseline, ctx);
      if (composited) {
        animations.push(layer.element.animate(composited, options));
      }
      if (paint) {
        animations.push(layer.element.animate(paint, options));
      }
    });
    return animations;
  } catch (error) {
    animations.forEach(animation => animation.cancel());
    ParallaxLogger.warn('Scroll timeline unavailable; using JS engine', {
      error,
    });
    return null;
  }
};
