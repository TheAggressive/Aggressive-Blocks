/**
 * Ticker block — pure helpers (safe to unit-test without the DOM runtime).
 *
 * @package Aggressive_Blocks
 */

import { DEFAULT_TICKER_SPEED } from './constants';

/** Conditions under which the marquee may move at all (pause aside). */
export interface TickerRunState {
  isDestroyed: boolean;
  isIntersecting: boolean;
  isDocumentVisible: boolean;
  reducedMotion: boolean;
  /** Loop duration in ms; 0 until content is measured. */
  loopDuration: number;
}

export interface TickerPauseState {
  /** Manual pause from the play/pause control (or reduced-motion lock). */
  isPaused: boolean;
  /** Temporary hold from hover / keyboard focus. */
  isHeld: boolean;
  /** Reduced-motion lock — animation must not run; control stays disabled. */
  motionLocked: boolean;
}

/**
 * Milliseconds for the track to travel one copy's width at `pxPerSecond`.
 * Speed is in px/s, so adding content lengthens the loop instead of
 * speeding the marquee up.
 */
export function getTickerLoopDuration(
  loopWidth: number,
  pxPerSecond: number
): number {
  if (loopWidth <= 0 || pxPerSecond <= 0) {
    return 0;
  }

  return (loopWidth / pxPerSecond) * 1000;
}

/**
 * Keyframes for one loop: the track shifts by one copy's width. Reverse
 * (rightward) runs the same shift backwards.
 */
export function getTickerKeyframes(
  loopWidth: number,
  reverse: boolean
): Keyframe[] {
  const start = { transform: 'translate3d(0, 0, 0)' };
  const end = { transform: `translate3d(${-loopWidth}px, 0, 0)` };
  return reverse ? [end, start] : [start, end];
}

/** Position within the loop (0–1) for an animation's current time. */
export function getTickerLoopPhase(
  currentTime: number,
  loopDuration: number
): number {
  if (!Number.isFinite(currentTime) || loopDuration <= 0) {
    return 0;
  }

  return (
    (((currentTime % loopDuration) + loopDuration) % loopDuration) /
    loopDuration
  );
}

/** Parse the scroll speed (px/s) from `data-ticker-speed`. */
export function parseTickerDataSpeed(
  value: string | undefined,
  fallback = DEFAULT_TICKER_SPEED
): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Whether the marquee scrolls right based on `data-ticker-direction`. */
export function isTickerReverseDirection(
  direction: string | undefined
): boolean {
  return direction === 'right';
}

/**
 * Manual pause, hover/focus hold, or reduced-motion lock all freeze motion.
 */
export function isEffectivelyPaused(state: TickerPauseState): boolean {
  return state.isPaused || state.isHeld || state.motionLocked;
}

/**
 * Whether the marquee may move right now. Pause is separate: a paused
 * ticker glides its playback rate to zero rather than stopping here.
 */
export function canRunTicker(state: TickerRunState): boolean {
  return (
    !state.isDestroyed &&
    state.isIntersecting &&
    state.isDocumentVisible &&
    !state.reducedMotion &&
    state.loopDuration > 0
  );
}

/**
 * Advance motion progress toward `target` at a constant rate, so a full
 * 0 → 1 ramp (or 1 → 0 glide) takes `durationMs`.
 */
export function stepTickerMotion(
  motion: number,
  target: number,
  deltaMs: number,
  durationMs: number
): number {
  if (durationMs <= 0) {
    return target;
  }

  const step = Math.max(deltaMs, 0) / durationMs;
  return target > motion
    ? Math.min(target, motion + step)
    : Math.max(target, motion - step);
}

/**
 * Speed multiplier for a motion progress. Smoothstep, so the marquee eases
 * out of full speed and settles into a stop (and the reverse) with no jolt.
 */
export function easeTickerMotion(motion: number): number {
  const p = Math.min(Math.max(motion, 0), 1);
  return p * p * (3 - 2 * p);
}

/**
 * Pick `value` when it is in `allowed`, otherwise `fallback`.
 */
export function pickAllowed<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  if (value !== undefined && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }

  return fallback;
}

/** Whether `target` is (or is inside) the ticker play/pause control. */
export function isTickerPauseControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.ticker__pause'));
}

/**
 * Resolve the marquee content's computed text color for the pause control.
 * Prefers the first painted child so inner-block color classes win.
 */
export function resolveTickerControlColor(content: HTMLElement | null): string {
  if (!content) {
    return '';
  }

  const sample =
    content.querySelector<HTMLElement>(
      'p, span, a, .aggressive-apparel-free-shipping-message, li'
    ) ?? content;

  return getComputedStyle(sample).color;
}
