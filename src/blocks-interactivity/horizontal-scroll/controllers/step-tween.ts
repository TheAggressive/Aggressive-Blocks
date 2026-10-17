import { clamp, easeInOutCubic } from '../logic';
import { STOP_EPSILON_PX } from './step-constants';

export type ScrollTweenCallbacks = {
  onFrame: (position: number) => void;
  onComplete: () => void;
  /** Return false to abort a stale generation mid-flight. */
  isCurrent: () => boolean;
};

/**
 * Eased document scroll tween. Returns the rAF handle (0 when completed sync).
 */
export function startScrollTween(params: {
  from: number;
  to: number;
  durationMs: number;
  callbacks: ScrollTweenCallbacks;
}): number {
  const { from, to, durationMs, callbacks } = params;
  const distance = to - from;

  if (durationMs <= 0 || Math.abs(distance) < STOP_EPSILON_PX) {
    callbacks.onFrame(to);
    callbacks.onComplete();
    return 0;
  }

  const start = performance.now();

  const tick = (now: number): void => {
    if (!callbacks.isCurrent()) return;

    const t = clamp((now - start) / durationMs, 0, 1);
    callbacks.onFrame(from + distance * easeInOutCubic(t));

    if (t < 1) {
      window.requestAnimationFrame(tick);
    } else {
      callbacks.onComplete();
    }
  };

  return window.requestAnimationFrame(tick);
}
