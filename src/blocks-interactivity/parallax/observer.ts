/**
 * Intersection Observer for the Parallax block.
 *
 * Its single job is activating/deactivating an instance in the shared
 * frame engine (plus feeding the optional debug controller). All motion
 * math lives in the engine.
 *
 * @package Aggressive Apparel
 */

import {
  refreshInstanceGeometry,
  setInstanceActive,
  type ParallaxInstance,
} from './engine';
import { getObserverRootMargin, getValidIntersectionRatio } from './utils';

/** Debug hook receiving raw observer data; loaded lazily in debug mode. */
export type IntersectionDebugHook = (
  ratio: number,
  isIntersecting: boolean
) => void;

/**
 * Create and start the observer for a parallax instance.
 */
export const observeInstance = (
  instance: ParallaxInstance,
  onDebugEntry?: IntersectionDebugHook
): IntersectionObserver => {
  const { ctx } = instance;

  const rootMargin = getObserverRootMargin(
    ctx.detectionBoundary,
    ctx.activationBuffer ?? 20,
    window.innerHeight
  );
  // Active whenever ANY part of the block is inside the buffered zone.
  // Gating on visibilityTrigger here (as this once did) switched tall
  // sections off while they still filled much of the screen: progress
  // runs until the block has fully left the zone, and the trigger is
  // already applied by the progress math itself (motion holds still
  // until the trigger point). A zero threshold keeps the two in step.
  const threshold = 0;
  // Stashed so the (async-loaded) debug adapter shows the exact value
  // the production observer runs with — no re-derivation drift.
  ctx.effectiveThreshold = threshold;

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        // Free layout-true rect: keep the engine's cached geometry honest.
        refreshInstanceGeometry(instance, entry.boundingClientRect);

        const ratio = getValidIntersectionRatio(entry.intersectionRatio, 0);
        const isIntersecting = entry.isIntersecting;

        ctx.intersectionRatio = ratio;
        ctx.isIntersecting = isIntersecting;

        setInstanceActive(instance, isIntersecting);
        onDebugEntry?.(ratio, isIntersecting);
      });
    },
    { threshold: [threshold], rootMargin }
  );

  observer.observe(instance.root);
  return observer;
};
