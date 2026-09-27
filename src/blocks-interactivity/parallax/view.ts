/// <reference types="@wordpress/interactivity" />
/**
 * Advanced Parallax Container — front-end entry.
 *
 * Each container picks a renderer once at init:
 *   - native scroll-driven animations (timeline.ts) wherever the browser
 *     supports them — zero per-frame JavaScript;
 *   - the shared JS frame engine (engine.ts: one set of listeners + one
 *     rAF loop for the whole page) as the fallback and for 3D pointer
 *     mode.
 * Both render from the same pure frame function, so they look identical.
 * Layer settings are parsed once (layers.ts). Debug tooling is
 * code-split and only fetched when a block has Debug Mode enabled.
 *
 * @package Aggressive Apparel
 */
import { getContext, getElement, store } from '@wordpress/interactivity';
import { applyParallaxDefaults, MOBILE_MAX_WIDTH_PX } from './config';
import {
  createInstance,
  registerInstance,
  setInstanceActive,
  switchToFrameRenderer,
} from './engine';
import { collectLayers, restoreLayerStyles } from './layers';
import { observeInstance } from './observer';
import { canUseScrollTimeline, startTimelineAnimations } from './timeline';
import type { ParallaxContext } from './types';
import { ParallaxLogger, validateConfiguration } from './utils';

import type { DebugController } from './debug/controller';

const INITIALIZED_CLASS = 'aggressive-apparel-parallax--initialized';
/** Marks blocks rendered by native scroll-driven animations. */
const TIMELINE_CLASS = 'aggressive-apparel-parallax--scroll-timeline';

const startParallax = (
  ref: HTMLElement,
  ctx: ParallaxContext
): (() => void) => {
  const container = ref.querySelector<HTMLElement>(
    '.aggressive-apparel-parallax__container'
  );

  // Decided before collectLayers() writes any style, so the ancestor
  // overflow check reads clean computed styles.
  const renderer = canUseScrollTimeline(ref, ctx) ? 'timeline' : 'frame';
  const layers = collectLayers(ref, ctx);
  const instance = createInstance(ref, container, ctx, layers, renderer);

  let animations: Animation[] = [];
  if (instance.renderer === 'timeline') {
    // Keyframes bake in the baseline, so they are built right after the
    // engine calibrates it (batched with every other block's priming).
    instance.onPrimed = () => {
      const started = startTimelineAnimations(
        ref,
        layers,
        ctx,
        instance.baselineProgress
      );
      if (started) {
        animations = started;
        ref.classList.add(TIMELINE_CLASS);
      } else {
        switchToFrameRenderer(instance);
      }
    };
  }

  let debugController: DebugController | null = null;
  if (ctx.debugMode) {
    // Code-split: debug UI is only downloaded when explicitly enabled.
    import('./debug/controller')
      .then(module => {
        debugController = module.createDebugController(instance);
        instance.onFrame = progress => debugController?.onFrame(progress);
      })
      .catch(error => {
        ParallaxLogger.error('Failed to load parallax debug tooling', {
          error,
        });
      });
  }

  const observer = observeInstance(instance, (ratio, isIntersecting) =>
    debugController?.onIntersection(ratio, isIntersecting)
  );
  const unregister = registerInstance(instance);

  ref.classList.add(INITIALIZED_CLASS);
  ctx.hasInitialized = true;

  return () => {
    setInstanceActive(instance, false);
    observer.disconnect();
    unregister();
    debugController?.destroy();
    animations.forEach(animation => animation.cancel());
    layers.forEach(restoreLayerStyles);
    ref.classList.remove(INITIALIZED_CLASS, TIMELINE_CLASS);
    ctx.hasInitialized = false;
  };
};

store('aggressive-blocks/parallax', {
  callbacks: {
    initParallax: () => {
      const rawContext = getContext<ParallaxContext>();
      const { ref } = getElement();

      if (!ref || !rawContext) {
        ParallaxLogger.warn('Parallax init skipped: missing element/context');
        return;
      }

      const ctx = applyParallaxDefaults(rawContext);
      const validation = validateConfiguration(ctx);
      if (!validation.isValid) {
        ParallaxLogger.error('Parallax configuration validation failed:', {
          errors: validation.errors,
        });
      }

      if (!ctx.id) {
        ctx.id =
          ref.getAttribute('data-instance-id') ?? `parallax_${Date.now()}`;
      }

      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const mobileQuery = window.matchMedia(
        `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`
      );

      let stopEngine: (() => void) | undefined;

      const shouldRun = (): boolean => {
        if (motionQuery.matches) {
          return false;
        }
        if (ctx.disableOnMobile && mobileQuery.matches) {
          return false;
        }
        return true;
      };

      const syncEngine = (): void => {
        if (shouldRun()) {
          if (!stopEngine) {
            stopEngine = startParallax(ref, ctx);
          }
          return;
        }
        if (stopEngine) {
          stopEngine();
          stopEngine = undefined;
        }
      };

      // Accessibility: honor reduced motion entirely — no listeners, no
      // observers, no transforms. Content renders in its natural position.
      // disableOnMobile likewise skips the engine below the breakpoint.
      syncEngine();

      motionQuery.addEventListener('change', syncEngine);
      mobileQuery.addEventListener('change', syncEngine);

      return () => {
        motionQuery.removeEventListener('change', syncEngine);
        mobileQuery.removeEventListener('change', syncEngine);
        stopEngine?.();
        stopEngine = undefined;
      };
    },
  },
});
