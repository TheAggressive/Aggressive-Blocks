/**
 * Ticker block — DOM animation runtime.
 *
 * Clones enough `.ticker__content` copies to cover the scroll area, then
 * loops the track by one copy's width with a Web Animation (compositor-run).
 * Pause, hover hold, and resume glide the playback rate over a few frames.
 *
 * @package Aggressive_Blocks
 */

import {
  CLONE_ATTR,
  CONTROL_COLOR_VAR,
  MAX_TICKER_CLONES,
  SELECTORS,
  TICKER_MOTION_EASE_MS,
} from './constants';
import {
  canRunTicker,
  easeTickerMotion,
  getTickerKeyframes,
  getTickerLoopDuration,
  getTickerLoopPhase,
  isTickerReverseDirection,
  parseTickerDataSpeed,
  resolveTickerControlColor,
  stepTickerMotion,
} from './logic';

interface TickerMetrics {
  maxContentWidth: number;
  trackWidth: number;
}

export interface TickerRuntime {
  destroy: () => void;
}

const tickerRuntimes = new WeakMap<HTMLElement, TickerRuntime>();

/**
 * Strip hydration/accessibility attributes from a runtime clone's subtree.
 *
 * Clones are created after the Interactivity API has hydrated, so their
 * `data-wp-*` directives are inert — leaving them in place is misleading and
 * duplicate `aria-live` regions / ids are invalid. Clones are purely
 * presentational (`aria-hidden` + `inert`).
 */
function sanitizeTickerClone(clone: HTMLElement): void {
  const elements = [clone, ...Array.from(clone.querySelectorAll('*'))];

  elements.forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      if (attribute.name.startsWith('data-wp-')) {
        element.removeAttribute(attribute.name);
      }
    });

    element.removeAttribute('aria-live');
    element.removeAttribute('aria-atomic');
    element.removeAttribute('id');
  });
}

/**
 * Mount (or remount) the ticker animation runtime on a root element.
 * Returns a destroy function; calling setup again on the same root
 * replaces the previous runtime.
 */
export function setupTicker(ticker: HTMLElement): TickerRuntime {
  tickerRuntimes.get(ticker)?.destroy();

  const scroll = ticker.querySelector<HTMLElement>(SELECTORS.scroll);
  const track = ticker.querySelector<HTMLElement>(SELECTORS.track);
  if (!scroll || !track) {
    const noop: TickerRuntime = { destroy: () => undefined };
    return noop;
  }

  let isDestroyed = false;
  let resizeFrameId = 0;
  let glideFrameId = 0;
  let glidePreviousTime = 0;
  let cloneSyncFrameId = 0;
  let contents: HTMLElement[] = [];
  let loopWidth = 0;
  let loopDuration = 0;
  let reverse = false;
  let animation: Animation | null = null;
  let appliedRate = 0;
  let isIntersecting = !('IntersectionObserver' in window);
  let isDocumentVisible = !document.hidden;
  let isPaused = ticker.classList.contains('is-paused');
  // Eased speed progress (0 = stopped, 1 = full speed). Pausing, holding,
  // and resuming glide the animation's playback rate instead of jumping.
  let motion = isPaused ? 0 : 1;
  const watchedImages = new WeakSet<HTMLImageElement>();
  const reducedMotionMql = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );

  const getContents = (): HTMLElement[] =>
    Array.from(track.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child.classList.contains('ticker__content')
    );

  const getContentWidth = (content: HTMLElement): number =>
    content.getBoundingClientRect().width;

  const canRun = (): boolean =>
    canRunTicker({
      isDestroyed,
      isIntersecting,
      isDocumentVisible,
      reducedMotion: reducedMotionMql.matches,
      loopDuration,
    });

  /**
   * Build or retime the loop. The track travels one copy's width and wraps,
   * which is seamless because every copy is identical. It runs as a Web
   * Animation, so steady scrolling stays on the compositor with no
   * per-frame JavaScript; only a pause/resume glide touches it per frame.
   */
  const syncLoop = (): void => {
    const nextReverse = isTickerReverseDirection(
      ticker.dataset.tickerDirection
    );
    const nextDuration = getTickerLoopDuration(
      loopWidth,
      parseTickerDataSpeed(ticker.dataset.tickerSpeed)
    );

    if (nextDuration <= 0 || typeof track.animate !== 'function') {
      animation?.cancel();
      animation = null;
      loopDuration = 0;
      return;
    }

    const keyframes = getTickerKeyframes(loopWidth, nextReverse);

    if (!animation) {
      animation = track.animate(keyframes, {
        duration: nextDuration,
        iterations: Infinity,
        easing: 'linear',
      });
      // Held until syncPlayback() decides it should run.
      animation.pause();
      appliedRate = 0;
    } else if (nextDuration !== loopDuration || nextReverse !== reverse) {
      // Keep the loop's phase so a re-measure doesn't jump the copy.
      const phase = getTickerLoopPhase(
        Number(animation.currentTime ?? 0),
        loopDuration
      );
      const effect = animation.effect as KeyframeEffect | null;
      effect?.setKeyframes(keyframes);
      effect?.updateTiming({ duration: nextDuration });
      animation.currentTime = phase * nextDuration;
    }

    loopDuration = nextDuration;
    reverse = nextReverse;
  };

  /** Drive the animation at the eased speed for the current motion. */
  const applyRate = (): void => {
    if (!animation) return;

    const rate = easeTickerMotion(motion);
    if (rate <= 0) {
      animation.pause();
      appliedRate = 0;
      return;
    }

    if (animation.playState !== 'running') {
      animation.playbackRate = rate;
      animation.play();
    } else if (rate !== appliedRate) {
      // Syncs with the compositor instead of snapping its current time.
      animation.updatePlaybackRate(rate);
    }
    appliedRate = rate;
  };

  const stopGlide = (): void => {
    if (glideFrameId) {
      window.cancelAnimationFrame(glideFrameId);
      glideFrameId = 0;
    }
    glidePreviousTime = 0;
  };

  const glide = (time: number): void => {
    glideFrameId = 0;

    if (!canRun()) {
      syncPlayback();
      return;
    }

    const target = isPaused ? 0 : 1;
    const delta = glidePreviousTime ? time - glidePreviousTime : 0;
    glidePreviousTime = time;
    motion = stepTickerMotion(motion, target, delta, TICKER_MOTION_EASE_MS);
    applyRate();

    if (motion === target) {
      glidePreviousTime = 0;
      return;
    }

    glideFrameId = window.requestAnimationFrame(glide);
  };

  /** Reconcile playback with the pause state and the run gates. */
  const syncPlayback = (): void => {
    if (!animation) return;

    const target = isPaused ? 0 : 1;

    if (!canRun()) {
      // Nobody sees a glide while stopped (offscreen, hidden tab, reduced
      // motion), so settle at the target and resume from a clean state.
      stopGlide();
      motion = target;
      animation.pause();
      appliedRate = 0;
      return;
    }

    if (motion === target) {
      stopGlide();
      applyRate();
      return;
    }

    if (!glideFrameId) {
      glideFrameId = window.requestAnimationFrame(glide);
    }
  };

  const watchImages = (): void => {
    track.querySelectorAll('img').forEach(image => {
      if (watchedImages.has(image)) return;

      watchedImages.add(image);
      if (!image.complete) {
        image.addEventListener('load', scheduleMeasure);
        image.addEventListener('error', scheduleMeasure);
      }
    });
  };

  const measure = (): void => {
    if (isDestroyed) return;

    const nextContents = getContents();
    const firstContent = nextContents[0];
    const template = nextContents[1] || nextContents[0];
    const containerWidth = scroll.getBoundingClientRect().width;
    const firstWidth = firstContent ? getContentWidth(firstContent) : 0;
    if (!firstContent || !template || containerWidth <= 0 || firstWidth <= 0) {
      loopWidth = 0;
      syncLoop();
      return;
    }

    const metrics = nextContents.reduce<TickerMetrics>(
      (result, content) => {
        const width = getContentWidth(content);

        return {
          maxContentWidth: Math.max(result.maxContentWidth, width),
          trackWidth: result.trackWidth + width,
        };
      },
      { maxContentWidth: 0, trackWidth: 0 }
    );

    const trackWidth = metrics.trackWidth;
    const maxContentWidth = metrics.maxContentWidth || firstWidth;
    // The loop shifts by one copy, so the track must cover the scroll area
    // plus that shift (with a copy of headroom) at every point in the loop.
    const minTrackWidth = containerWidth + maxContentWidth * 2;
    // Total (not per-pass) clone count: measure() re-runs on resize and
    // image load, so a per-pass budget could still grow the DOM unbounded.
    const existingClones = nextContents.filter(content =>
      content.hasAttribute(CLONE_ATTR)
    ).length;
    // Clones are copies of one template in a flex track, so they share its
    // width — compute the deficit up front and append one batched fragment
    // instead of paying a measuring reflow per appended clone.
    const templateWidth = getContentWidth(template) || maxContentWidth;
    const neededClones = Math.min(
      Math.max(Math.ceil((minTrackWidth - trackWidth) / templateWidth), 0),
      MAX_TICKER_CLONES - existingClones
    );
    if (neededClones > 0) {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < neededClones; i += 1) {
        const clone = template.cloneNode(true) as HTMLElement;
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('inert', '');
        clone.setAttribute(CLONE_ATTR, '');
        sanitizeTickerClone(clone);
        fragment.appendChild(clone);
        nextContents.push(clone);
      }
      track.appendChild(fragment);
    }

    contents = nextContents;
    loopWidth = firstWidth;

    watchImages();
    syncControlColor();
    syncLoop();
    syncPlayback();
  };

  /**
   * Pause/play must track marquee copy color — not the wrapper's
   * `has-*-color`. Inner blocks often use adaptive tokens (e.g.
   * surface-elevated) that diverge from a fixed wrapper white in dark mode.
   */
  const syncControlColor = (): void => {
    if (isDestroyed) return;

    const source =
      contents.find(content => !content.hasAttribute(CLONE_ATTR)) ??
      getContents().find(content => !content.hasAttribute(CLONE_ATTR)) ??
      null;
    const color = resolveTickerControlColor(source);
    if (color) {
      ticker.style.setProperty(CONTROL_COLOR_VAR, color);
    } else {
      ticker.style.removeProperty(CONTROL_COLOR_VAR);
    }
  };

  const scheduleMeasure = (): void => {
    if (isDestroyed) return;

    if (resizeFrameId) {
      window.cancelAnimationFrame(resizeFrameId);
    }

    resizeFrameId = window.requestAnimationFrame(() => {
      resizeFrameId = 0;
      measure();
    });
  };

  // Keep runtime clones in sync with hydrated content. The Interactivity API
  // only hydrates DOM present at load time; clones are inert snapshots.
  const originals = getContents().filter(
    content => !content.hasAttribute(CLONE_ATTR)
  );

  const syncClones = (): void => {
    if (isDestroyed || originals.length === 0) return;

    const source = originals[0];

    getContents().forEach(content => {
      if (!content.hasAttribute(CLONE_ATTR)) return;

      content.innerHTML = source.innerHTML;
      sanitizeTickerClone(content);
    });

    // Text changes shift content widths; re-measure so the loop stays seamless.
    scheduleMeasure();
  };

  const scheduleCloneSync = (): void => {
    if (isDestroyed) return;

    if (cloneSyncFrameId) {
      window.cancelAnimationFrame(cloneSyncFrameId);
    }

    cloneSyncFrameId = window.requestAnimationFrame(() => {
      cloneSyncFrameId = 0;
      syncClones();
    });
  };

  const contentObserver = new MutationObserver(scheduleCloneSync);
  originals.forEach(original => {
    contentObserver.observe(original, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });

  const resizeObserver = new ResizeObserver(scheduleMeasure);
  resizeObserver.observe(ticker);
  resizeObserver.observe(scroll);

  const intersectionObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(entries => {
          isIntersecting = entries.some(entry => entry.isIntersecting);
          syncPlayback();
        })
      : null;
  intersectionObserver?.observe(ticker);

  const attributeObserver = new MutationObserver(() => {
    isPaused = ticker.classList.contains('is-paused');
    syncLoop();
    syncPlayback();
  });
  attributeObserver.observe(ticker, {
    attributes: true,
    attributeFilter: ['class', 'data-ticker-speed', 'data-ticker-direction'],
  });

  const handleVisibilityChange = (): void => {
    isDocumentVisible = !document.hidden;
    syncPlayback();
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const handleReducedMotionChange = (): void => {
    syncPlayback();
  };
  reducedMotionMql.addEventListener('change', handleReducedMotionChange);

  // Adaptive content colors flip with color-scheme / data-theme — re-sample.
  const colorSchemeMql = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeColorChange = (): void => {
    syncControlColor();
  };
  colorSchemeMql.addEventListener('change', handleThemeColorChange);
  const themeObserver = new MutationObserver(handleThemeColorChange);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  });

  watchImages();

  const runtime: TickerRuntime = {
    destroy: () => {
      if (isDestroyed) return;

      isDestroyed = true;
      stopGlide();
      window.cancelAnimationFrame(resizeFrameId);
      window.cancelAnimationFrame(cloneSyncFrameId);
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      attributeObserver.disconnect();
      contentObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      reducedMotionMql.removeEventListener('change', handleReducedMotionChange);
      colorSchemeMql.removeEventListener('change', handleThemeColorChange);
      animation?.cancel();
      animation = null;
      track.querySelectorAll('img').forEach(image => {
        image.removeEventListener('load', scheduleMeasure);
        image.removeEventListener('error', scheduleMeasure);
      });
      // Drop runtime clones so a remount starts from the server-rendered pair.
      getContents().forEach(content => {
        if (content.hasAttribute(CLONE_ATTR)) {
          content.remove();
        }
      });
      ticker.style.removeProperty(CONTROL_COLOR_VAR);
      tickerRuntimes.delete(ticker);
    },
  };

  tickerRuntimes.set(ticker, runtime);
  measure();

  return runtime;
}

/** Destroy the runtime mounted on `ticker`, if any. */
export function destroyTicker(ticker: HTMLElement): void {
  tickerRuntimes.get(ticker)?.destroy();
}
