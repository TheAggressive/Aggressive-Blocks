/**
 * Layer styling as a pure function of scroll progress, plus the JS frame
 * renderer that writes it.
 *
 * `computeScrollFrame()` is the single source of truth for what a layer
 * looks like at a given progress. Both renderers consume it:
 *   - timeline.ts samples it into keyframes for a native scroll-driven
 *     animation (no per-frame JS at all);
 *   - `applyLayerFrame()` below evaluates it every frame in the JS
 *     engine and adds pointer / magnetic offsets on top.
 * Because both read the same function, the two paths cannot drift.
 *
 * Movement, scale, and rotation use the individual CSS transform
 * properties (`translate`, `scale`, `rotate` — including axis tilts via
 * `rotate: x 30deg`). Each channel is independent, so a rotation effect
 * can never clobber the parallax translation.
 *
 * @package Aggressive Apparel
 */

import type { CachedLayer } from './layers';
import type { ParallaxContext, ParallaxEffects } from './types';
import {
  calculateBlur,
  calculateColorTransition,
  calculateMagneticForce,
  calculateRotation,
  calculateScrollOpacity,
  calculateShadow,
} from './utils';

/** Inputs shared by every layer of an instance for one frame. */
export interface FrameInput {
  /** Scroll progress through the detection zone, 0..1. */
  progress: number;
  /**
   * Progress at which layers sit exactly where the editor placed them
   * (calibrated at load so pages open looking like the editor).
   */
  baseline: number;
  /** Smoothed pointer position, -0.5..0.5 (0 = center). */
  pointerX: number;
  /** Smoothed pointer position, -0.5..0.5 (0 = center). */
  pointerY: number;
  /** Whether pointer/3D interaction is active for this instance. */
  is3D: boolean;
}

// ---------------------------------------------------------------------------
// Scroll-driven visual effects (pure: progress in, CSS values out).
// ---------------------------------------------------------------------------

const scrollOpacity = (
  config: ParallaxEffects['scrollOpacity'],
  progress: number
): string | undefined => {
  if (!config?.enabled) {
    return undefined;
  }
  return calculateScrollOpacity(
    progress,
    config.fadeRange,
    config.startOpacity,
    config.endOpacity,
    config.effectStart ?? 0.0,
    config.effectEnd ?? 0.25,
    config.effectMode ?? 'sustain'
  ).toFixed(3);
};

const scrollBlur = (
  config: ParallaxEffects['blur'],
  progress: number
): number | undefined => {
  if (
    !config?.enabled ||
    config.startBlur === undefined ||
    config.endBlur === undefined
  ) {
    return undefined;
  }
  return calculateBlur(
    progress,
    config.startBlur,
    config.endBlur,
    config.fadeRange || 'full',
    config.effectStart ?? 0.0,
    config.effectEnd ?? 0.25,
    config.effectMode ?? 'sustain'
  );
};

const COLOR_PROPERTY = {
  background: 'backgroundColor',
  text: 'color',
  border: 'borderColor',
} as const;

const applyColorEffect = (
  styles: Record<string, string>,
  config: ParallaxEffects['colorTransition'],
  progress: number
): void => {
  if (!config?.enabled || !config.startColor || !config.endColor) {
    return;
  }
  const prop = COLOR_PROPERTY[config.transitionType];
  if (!prop) {
    return;
  }
  styles[prop] = calculateColorTransition(
    progress,
    config.startColor,
    config.endColor,
    config.effectStart ?? 0.0,
    config.effectEnd ?? 0.25,
    config.effectMode ?? 'sustain'
  );
};

/**
 * Returns the drop-shadow filter fragment when the shadow targets
 * `filter`; box/text shadows are written straight into `styles`.
 */
const applyShadowEffect = (
  styles: Record<string, string>,
  config: ParallaxEffects['dynamicShadow'],
  progress: number
): string | undefined => {
  if (!config?.enabled || !config.startShadow || !config.endShadow) {
    return undefined;
  }
  const shadow = calculateShadow(
    progress,
    config.startShadow,
    config.endShadow,
    config.effectStart ?? 0.0,
    config.effectEnd ?? 0.25,
    config.effectMode ?? 'sustain'
  );
  switch (config.shadowType) {
    case 'box-shadow':
      styles.boxShadow = shadow;
      return undefined;
    case 'text-shadow':
      styles.textShadow = shadow;
      return undefined;
    case 'drop-shadow':
      return `drop-shadow(${shadow})`;
  }
  return undefined;
};

const scrollRotate = (
  config: ParallaxEffects['rotation'],
  progress: number
): string | undefined => {
  if (
    !config?.enabled ||
    config.startRotation === undefined ||
    config.endRotation === undefined
  ) {
    return undefined;
  }
  const rotation = calculateRotation(
    progress,
    config.startRotation,
    config.endRotation,
    config.speed || 1.0,
    config.mode || 'range',
    config.effectStart ?? 0.0,
    config.effectEnd ?? 0.25,
    config.effectMode ?? 'sustain'
  );

  // Every axis goes through the `rotate` property (`rotate: x 30deg`),
  // leaving `transform` untouched for the author and the channels
  // independent of translate/scale.
  switch (config.axis || 'z') {
    case 'x':
      return `x ${rotation}deg`;
    case 'y':
      return `y ${rotation}deg`;
    default:
      return `${rotation}deg`;
  }
};

// ---------------------------------------------------------------------------
// Pure frame computation (shared by both renderers)
// ---------------------------------------------------------------------------

/** A layer's scroll-driven appearance at one progress value. */
export interface ScrollFrame {
  /** Scroll travel in px (pointer offsets are added by the JS renderer). */
  x: number;
  y: number;
  /** Depth cue × zoom effect; 1 = untouched. */
  scale: number;
  /**
   * Remaining effect styles keyed by camelCase CSS property: `rotate`,
   * `opacity`, `filter` (compositor-friendly) and colors / shadows
   * (paint). Only enabled effects appear, with the same keys at every
   * progress value — which is what keyframe sampling relies on.
   */
  styles: Record<string, string>;
}

/**
 * What the layer looks like at `progress`, relative to the calibrated
 * `baseline` (where the layer sits exactly as placed in the editor).
 */
export const computeScrollFrame = (
  layer: CachedLayer,
  progress: number,
  baseline: number,
  ctx: ParallaxContext
): ScrollFrame => {
  const { effects, depth } = layer;
  const eased = layer.ease(progress);

  // ease(baseline) is constant after priming — memoize it per layer.
  if (layer.baselineEasedFor !== baseline) {
    layer.baselineEasedFor = baseline;
    layer.baselineEased = layer.ease(baseline);
  }

  // Zero offset at the baseline (layout matches the editor), drifting
  // apart as the page scrolls away from it. Depth scales the travel:
  // far layers crawl, near layers sweep.
  const intensity = ctx.intensity ?? 50;
  const travel =
    (eased - layer.baselineEased) * 2 * intensity * layer.speed * (1 + depth);

  let x = 0;
  let y = 0;
  switch (layer.direction) {
    case 'up':
      y = -travel;
      break;
    case 'left':
      x = -travel;
      break;
    case 'right':
      x = travel;
      break;
    case 'both':
      x = travel * 0.5;
      y = travel * 0.5;
      break;
    case 'none':
      break;
    case 'down':
    default:
      y = travel;
      break;
  }

  let scale = layer.depthScale;
  if (effects.zoom?.enabled) {
    const zoomIntensity = effects.zoom.intensity || 0.2;
    scale *=
      effects.zoom.type === 'out'
        ? 1 - eased * zoomIntensity
        : 1 + eased * zoomIntensity;
  }

  const styles: Record<string, string> = {};
  if (!layer.hasFrameEffects) {
    return { x, y, scale, styles };
  }

  const opacity = scrollOpacity(effects.scrollOpacity, progress);
  if (opacity !== undefined) {
    styles.opacity = opacity;
  }

  const rotate = scrollRotate(effects.rotation, progress);
  if (rotate !== undefined) {
    styles.rotate = rotate;
  }

  applyColorEffect(styles, effects.colorTransition, progress);

  // One `filter` list: scroll blur (or the static depth-of-field blur)
  // followed by a drop-shadow, so neither overwrites the other.
  const filters: string[] = [];
  const blur = scrollBlur(effects.blur, progress);
  if (blur !== undefined) {
    filters.push(`blur(${blur}px)`);
  } else if (layer.dofBlur > 0) {
    filters.push(`blur(${layer.dofBlur.toFixed(2)}px)`);
  }
  const dropShadow = applyShadowEffect(styles, effects.dynamicShadow, progress);
  if (dropShadow) {
    filters.push(dropShadow);
  }
  if (filters.length) {
    styles.filter = filters.join(' ');
  }

  return { x, y, scale, styles };
};

// ---------------------------------------------------------------------------
// JS frame renderer
// ---------------------------------------------------------------------------

/**
 * Compute and write one layer's styles for the current frame.
 */
export const applyLayerFrame = (
  layer: CachedLayer,
  frame: FrameInput,
  ctx: ParallaxContext
): void => {
  const { element, effects, depth } = layer;
  const scroll = computeScrollFrame(layer, frame.progress, frame.baseline, ctx);
  let { x, y } = scroll;

  // Pointer motion-parallax around the focal plane: near layers move
  // against the pointer, far layers move with it (window-into-a-scene).
  if (frame.is3D && depth !== 0) {
    const maxShift = ctx.maxMouseTranslation ?? 20;
    const influence = ctx.mouseInfluenceMultiplier ?? 0.5;
    x += -frame.pointerX * depth * maxShift * 2 * influence;
    y += -frame.pointerY * depth * maxShift * 2 * influence;
  }

  let magnetX = 0;
  let magnetY = 0;
  if (frame.is3D && effects.magneticMouse?.enabled && layer.rect) {
    const { strength, range, mode } = effects.magneticMouse;
    // `rect` was read after last frame's write, so it includes last
    // frame's magnetic pull — remove it to measure from the un-pulled
    // center, otherwise the force feeds back into itself and jitters.
    const force = calculateMagneticForce(
      layer.rect.left + layer.rect.width / 2 - layer.magnetX,
      layer.rect.top + layer.rect.height / 2 - layer.magnetY,
      (frame.pointerX + 0.5) * window.innerWidth,
      (frame.pointerY + 0.5) * window.innerHeight,
      strength,
      range,
      mode
    );
    magnetX = force.x;
    magnetY = force.y;
  }
  layer.magnetX = magnetX;
  layer.magnetY = magnetY;
  x += magnetX;
  y += magnetY;

  // Skip the write when nothing moved (common while only the pointer
  // changes and this layer sits on the focal plane). Movement stays in the
  // 2D plane — depth is conveyed by speed/scale, never a literal
  // translateZ, so links inside a layer always hit-test where they paint.
  const translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  if (translate !== layer.lastTranslate) {
    layer.lastTranslate = translate;
    element.style.translate = translate;
  }

  // Deduped like translate — most layers hold a constant scale, and
  // redundant style writes cost a style recalc each frame.
  const scaleValue = scroll.scale === 1 ? '' : scroll.scale.toFixed(4);
  if (scaleValue !== layer.lastScale) {
    layer.lastScale = scaleValue;
    element.style.scale = scaleValue;
  }

  // Effect writes are deduped per property so unchanged values never
  // dirty the element's style. Effect props are fixed per layer config,
  // so keys never need removal — only their values change.
  const last = layer.lastEffectStyles;
  for (const prop in scroll.styles) {
    const value = scroll.styles[prop];
    if (last[prop] !== value) {
      last[prop] = value;
      (element.style as unknown as Record<string, string>)[prop] = value;
    }
  }
};
