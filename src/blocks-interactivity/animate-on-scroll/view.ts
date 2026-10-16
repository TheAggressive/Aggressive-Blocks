/// <reference types="@wordpress/interactivity" />
/**
 * Animate On Scroll — front-end entry.
 *
 * Production path: one IntersectionObserver per block toggles
 * `context.isVisible` (bound to the .is-visible class) and manages
 * stagger delays and the optional reverse-on-scroll-back exit. All state
 * lives per instance (context + closures) — nothing is shared between
 * blocks. Debug tooling lives in debug.ts and is only downloaded when a
 * block enables Debug Mode.
 *
 * Children render visible without JavaScript. On hydration the store arms
 * every block without animating out, then lets the configured observer
 * trigger its first entrance. Merely touching the viewport is not entry.
 *
 * @package Aggressive Apparel
 */
import { getContext, getElement, store } from '@wordpress/interactivity';

import {
  getEffectiveThreshold,
  getVisibilityThreshold,
} from '../debug-shared/utils';
import type { AosDebugController } from './debug';
import { setupStaggerDelays, type StaggerConfig } from './stagger-math';

// Re-export pure math for unit tests that import from this entry.
export {
  calculateRandomDelay,
  calculateSequentialDelay,
  calculateWaveDelay,
  createStaggerSeed,
  getChildStaggerDelay,
  hashToSeed,
  mulberry32,
} from './stagger-math';

interface DetectionBoundary {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

interface AnimateOnScrollContext {
  isVisible: boolean;
  /**
   * Set once on first entrance and never cleared. No internal consumer —
   * kept as the public `.has-animated` wrapper class so site CSS can
   * target "content that has already animated in".
   */
  hasAnimated: boolean;
  /** Drives the reverse (exit) animation state. */
  isExiting: boolean;
  debugMode: boolean;
  visibilityTrigger: number | string;
  detectionBoundary: DetectionBoundary;
  id: string;
  reverseOnScrollBack?: boolean;
  respectReducedMotion?: boolean;
  staggerPattern?: string;
  staggerDelay?: number;
  staggerWaveFrequency?: number;
  staggerRandomMin?: number;
  staggerRandomMax?: number;
  staggerSeed?: number;
}

/** True when any part of the element is inside the viewport. */
export const isInViewport = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
};

/**
 * True when the page cannot scroll any further down. A block that ends in
 * the detection boundary's bottom inset (-25% by default) at this point can
 * never reach its trigger, so it is revealed where it stands instead.
 */
export const isAtScrollEnd = (
  scrollTop: number,
  viewportHeight: number,
  scrollHeight: number
): boolean => scrollTop + viewportHeight >= scrollHeight - 1;

/**
 * Whether an observer entry counts as entering. `isIntersecting` matters at
 * a threshold of 0: the first report for an off-screen block has ratio 0,
 * which would otherwise pass and play the entrance out of view.
 */
export const isEntering = (
  entry: Pick<
    IntersectionObserverEntry,
    'isIntersecting' | 'intersectionRatio'
  >,
  threshold: number
): boolean => entry.isIntersecting && entry.intersectionRatio >= threshold;

const getStaggerConfig = (ctx: AnimateOnScrollContext): StaggerConfig => ({
  pattern: ctx.staggerPattern ?? 'sequential',
  delay: ctx.staggerDelay ?? 0.2,
  waveFrequency: ctx.staggerWaveFrequency ?? 1,
  randomMin: ctx.staggerRandomMin ?? 0,
  randomMax: ctx.staggerRandomMax ?? 0.5,
  seed: ctx.staggerSeed ?? 0,
});

/** Parse a CSS time custom property (`0.5s`, `200ms`) into seconds. */
export const parseCssTimeSeconds = (
  value: string,
  fallback: number
): number => {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return trimmed.endsWith('ms') ? n / 1000 : n;
};

/**
 * Largest per-child stagger delay currently written on direct children.
 * Used so exit hold covers the last cascading child.
 */
export const getMaxChildStaggerDelaySeconds = (
  element: HTMLElement
): number => {
  let max = 0;
  for (const child of Array.from(element.children) as HTMLElement[]) {
    const n = parseFloat(
      child.style.getPropertyValue('--wp-block-animate-on-scroll-stagger-delay')
    );
    if (Number.isFinite(n) && n > max) {
      max = n;
    }
  }
  return max;
};

/** Total time to keep `.is-exiting` until the slowest child finishes. */
export const getExitHoldMs = (
  durationSeconds: number,
  initialDelaySeconds: number,
  maxStaggerSeconds: number
): number => (durationSeconds + initialDelaySeconds + maxStaggerSeconds) * 1000;

// ---------------------------------------------------------------------------
// Sequence mode helpers
// ---------------------------------------------------------------------------

const hasAnimationSequenceAttributes = (element: HTMLElement): boolean =>
  Array.from(element.children).some(child =>
    (child as HTMLElement).hasAttribute('data-animate-sequence-type')
  );

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

store('aggressive-blocks/animate-on-scroll', {
  callbacks: {
    initObserver: () => {
      const ctx = getContext<AnimateOnScrollContext>();
      const { ref } = getElement();

      if (!ref) {
        return;
      }

      const isSequenceMode = ref.classList.contains('has-animation-sequence');
      if (isSequenceMode && !hasAnimationSequenceAttributes(ref)) {
        console.warn(
          '[AnimateOnScroll] Sequence mode enabled but no sequence attributes found on children.'
        );
      }

      const staggerEnabled = ref.dataset.staggerChildren === 'true';
      if (staggerEnabled) {
        setupStaggerDelays(ref, getStaggerConfig(ctx), false);
      }

      // Arming returns the children to their hidden "from" state (CSS).
      const arm = (): void => {
        ref.setAttribute('data-animate-id', ctx.id);
      };

      // Cache timing once — avoid getComputedStyle on every exit.
      const computedStyles = window.getComputedStyle(ref);
      const animationDurationSeconds = parseCssTimeSeconds(
        computedStyles.getPropertyValue(
          '--wp-block-animate-on-scroll-animation-duration'
        ),
        0.5
      );
      const initialDelaySeconds = parseCssTimeSeconds(
        computedStyles.getPropertyValue(
          '--wp-block-animate-on-scroll-initial-delay'
        ),
        0
      );

      // Reduced motion: unless the editor opted out, show content
      // immediately and skip all observation.
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;
      if (prefersReducedMotion && ctx.respectReducedMotion !== false) {
        ctx.isVisible = true;
        ctx.hasAnimated = true;
        return;
      }

      const rootMargin = `${ctx.detectionBoundary.top} ${ctx.detectionBoundary.right} ${ctx.detectionBoundary.bottom} ${ctx.detectionBoundary.left}`;
      // Elements taller than the root box can never reach the configured
      // ratio — observe at the reachable effective threshold instead.
      const calculateThreshold = (): number =>
        getEffectiveThreshold(
          getVisibilityThreshold(ctx.visibilityTrigger),
          ref.offsetHeight,
          window.innerHeight,
          rootMargin
        );
      let threshold = calculateThreshold();
      // Exit fires at half the entry threshold (hysteresis): the reverse
      // animation starts while the element is still meaningfully on
      // screen, and the gap between the two thresholds prevents
      // enter/exit flicker right at the boundary.
      let exitThreshold = threshold / 2;
      let exitTimeout: ReturnType<typeof setTimeout> | null = null;

      // Debug tooling is code-split; production pages never fetch it.
      // Loaded after threshold so the async callback closes over a defined value.
      let debugController: AosDebugController | null = null;
      let createDebug: (() => AosDebugController) | null = null;
      let disposed = false;
      if (ctx.debugMode) {
        import('./debug')
          .then(module => {
            if (disposed) {
              return;
            }
            createDebug = () =>
              module.createDebugController(
                {
                  id: ctx.id,
                  detectionBoundary: ctx.detectionBoundary,
                  threshold,
                  reverseOnScrollBack: ctx.reverseOnScrollBack,
                },
                ref
              );
            debugController = createDebug();
          })
          .catch(error => {
            console.warn(
              '[AnimateOnScroll] Failed to load debug tooling',
              error
            );
          });
      }

      // NOTE: the wrapper's class attribute is vdom-controlled (it has
      // data-wp-class directives), so exit/animated state MUST go through
      // context — classList changes are wiped on the next re-render.
      const clearExitState = (): void => {
        if (exitTimeout !== null) {
          clearTimeout(exitTimeout);
          exitTimeout = null;
        }
        ctx.isExiting = false;
        if (staggerEnabled) {
          setupStaggerDelays(ref, getStaggerConfig(ctx), false);
        }
      };

      const reveal = (): void => {
        if (ctx.isVisible) {
          return;
        }
        // A pending exit (rapid scroll-up-then-down) must not strip the
        // entrance mid-flight.
        clearExitState();
        ctx.isVisible = true;
        ctx.hasAnimated = true;
      };

      // On screen at the end of the page, where scrolling can no longer
      // carry the block up to its trigger.
      const isStuckAtPageEnd = (): boolean => {
        const scroller = document.scrollingElement ?? document.documentElement;
        return (
          isAtScrollEnd(
            scroller.scrollTop,
            window.innerHeight,
            scroller.scrollHeight
          ) && isInViewport(ref)
        );
      };

      // Hidden content must never hold keyboard focus: show it, and keep it
      // shown while focus is inside.
      const hasFocusWithin = (): boolean =>
        ref.contains(ref.ownerDocument.activeElement);

      const handleExit = (): void => {
        ctx.isVisible = false;
        ctx.isExiting = true;

        if (staggerEnabled) {
          setupStaggerDelays(ref, getStaggerConfig(ctx), true);
        }

        // Hold exit until duration + initial delay + slowest child stagger.
        const maxStaggerSeconds = staggerEnabled
          ? getMaxChildStaggerDelaySeconds(ref)
          : 0;
        const holdMs = getExitHoldMs(
          animationDurationSeconds,
          initialDelaySeconds,
          maxStaggerSeconds
        );

        if (exitTimeout !== null) {
          clearTimeout(exitTimeout);
        }
        exitTimeout = setTimeout(() => {
          exitTimeout = null;
          ctx.isExiting = false;
          if (staggerEnabled) {
            setupStaggerDelays(ref, getStaggerConfig(ctx), false);
          }
        }, holdMs);
      };

      let observer: IntersectionObserver;
      const createObserver = (): IntersectionObserver =>
        new IntersectionObserver(
          entries => {
            entries.forEach(entry => {
              if (isSequenceMode && !hasAnimationSequenceAttributes(ref)) {
                return;
              }

              if (isEntering(entry, threshold) || isStuckAtPageEnd()) {
                reveal();
              } else if (
                ctx.reverseOnScrollBack &&
                ctx.isVisible &&
                (entry.intersectionRatio <= exitThreshold ||
                  !entry.isIntersecting) &&
                !hasFocusWithin() &&
                !isStuckAtPageEnd()
              ) {
                handleExit();
              }

              // After the logic runs, so the panel reflects the store's
              // actual post-event visibility.
              debugController?.onEntry(
                entry.intersectionRatio,
                entry.isIntersecting,
                ctx.isVisible
              );
            });
          },
          {
            threshold: [...new Set([0, exitThreshold, threshold])],
            rootMargin,
          }
        );
      try {
        observer = createObserver();
      } catch (error) {
        // An invalid boundary (e.g. a unitless margin) throws here. The
        // block is not armed yet, so its content simply stays visible.
        console.warn('[AnimateOnScroll] Could not observe block', error);
        disposed = true;
        ctx.isVisible = true;
        ctx.hasAnimated = true;
        return;
      }

      // Establish the hidden state without playing an exit. Flush styles
      // while transitions are disabled, before the first observer report
      // can reveal a block that already meets its configured trigger.
      ref.setAttribute('data-aos-preparing', 'true');
      arm();
      ref.getBoundingClientRect();
      ref.removeAttribute('data-aos-preparing');

      observer.observe(ref);

      // Scroll and resize are checked once per frame, and only while the
      // block is hidden.
      let frame = 0;
      const checkPageEnd = (): void => {
        if (frame || ctx.isVisible) {
          return;
        }
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (!ctx.isVisible && isStuckAtPageEnd()) {
            reveal();
          }
        });
      };
      // The observer updates its root/target geometry automatically, but
      // its threshold list is immutable. Rebuild when the reachable entry
      // threshold changes after a viewport resize or content reflow.
      const refreshGeometry = (): void => {
        const next = calculateThreshold();
        if (next !== threshold) {
          observer.disconnect();
          threshold = next;
          exitThreshold = threshold / 2;
          observer = createObserver();
          observer.observe(ref);
          debugController?.destroy();
          debugController = createDebug?.() ?? null;
        }
        checkPageEnd();
      };
      const resizeObserver =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(refreshGeometry);
      resizeObserver?.observe(ref);
      ref.addEventListener('focusin', reveal);
      window.addEventListener('scroll', checkPageEnd, { passive: true });
      window.addEventListener('resize', refreshGeometry, { passive: true });

      return () => {
        disposed = true;
        ref.removeEventListener('focusin', reveal);
        window.removeEventListener('scroll', checkPageEnd);
        window.removeEventListener('resize', refreshGeometry);
        resizeObserver?.disconnect();
        if (frame) {
          window.cancelAnimationFrame(frame);
        }
        observer.disconnect();
        if (exitTimeout !== null) {
          clearTimeout(exitTimeout);
        }
        debugController?.destroy();
      };
    },
  },
});
