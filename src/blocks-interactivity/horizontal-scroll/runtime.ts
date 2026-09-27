/**
 * Horizontal-scroll runtime coordinator.
 *
 * Measurement, mode selection, and shared presentation live here. Each actual
 * scrolling model is isolated in its own controller module.
 */

import {
  addMediaChangeListener,
  buildSlideStops,
  clamp,
  computeScrollStart,
  formatSlideAnnouncement,
  getSlides,
  normalizeSnapBehavior,
  pickMode,
  progressToPercentage,
  resolveKeyboardIntent,
  resolveSpeed,
  resolveStepDurationMs,
  shouldIgnoreKeyboardEvent,
  shouldShowSwipeHint,
  toLogicalSlideOffsets,
  toSignedTranslate,
  type HScrollMode,
  type SnapBehavior,
  type SwipeHintStyle,
} from './logic';
import {
  createController,
  type Controller,
  type ControllerElements,
  type Geometry,
  type Presentation,
} from './controllers';

export interface HScrollI18n {
  /** sprintf-style template for the live announcement, e.g. "Slide %1$s of %2$s". */
  slideAnnouncement?: string;
  /** sprintf-style template for each slide's aria-label, e.g. "%1$s of %2$s". */
  slideLabel?: string;
}

export interface HScrollContext {
  speed: number;
  desktopBehavior?: 'pinned' | 'inline';
  snapBehavior?: SnapBehavior | 'proximity';
  /** Author step glide length in seconds (0.2–2). */
  stepDuration?: number;
  swipeHintStyle?: SwipeHintStyle;
  i18n?: HScrollI18n;
}

interface RuntimePresentation extends Presentation {
  setMode: (mode: HScrollMode) => void;
  setSlides: (slides: HTMLElement[]) => void;
  /** Whether the progress bar runs on the compositor timeline. */
  setCompositor: (active: boolean) => void;
}

/** Set an attribute only when it differs — avoids needless mutations. */
function setAttributeIfChanged(
  element: Element,
  name: string,
  value: string
): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

const DESKTOP_QUERY = '(pointer: fine) and (min-width: 782px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Keys that jump to the ends; the page's own Home/End unless focus is inside. */
const JUMP_KEYS = new Set(['Home', 'End']);

/**
 * Whether the browser supports CSS scroll-driven animations. When true the
 * runtime applies the compositor scrub animation (inline, see applyScrubTimeline)
 * to the track and the progress bar; both then run off the main thread, and the
 * JS baseline stops writing their transforms. A static browser capability,
 * evaluated once.
 */
const SUPPORTS_SCROLL_TIMELINE =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline: scroll()');

/** Inline animation longhands that make up the compositor scrub timeline. */
const SCRUB_ANIMATION_PROPS = [
  'animation-name',
  'animation-timing-function',
  'animation-fill-mode',
  'animation-duration',
  'animation-timeline',
  'animation-range',
] as const;
const MODE_CLASSES = [
  'is-enhanced',
  'is-horizontal',
  'is-snap',
  'is-static',
  'is-paged',
];

const runtimes = new WeakMap<HTMLElement, () => void>();

/** Apply (or clear) one inline scroll-driven animation on an element. */
function setScrollAnimation(
  element: HTMLElement | null,
  name: string | null,
  scrollStart: number,
  scrollDistance: number
): void {
  if (!element) return;

  if (!name) {
    SCRUB_ANIMATION_PROPS.forEach(prop => element.style.removeProperty(prop));
    return;
  }

  element.style.setProperty('animation-name', name);
  element.style.setProperty('animation-timing-function', 'linear');
  element.style.setProperty('animation-fill-mode', 'both');
  element.style.setProperty('animation-duration', 'auto');
  element.style.setProperty('animation-timeline', 'scroll(root block)');
  element.style.setProperty(
    'animation-range',
    `${scrollStart}px ${scrollStart + scrollDistance}px`
  );
}

/**
 * Apply (or clear) the compositor scroll-driven scrub on the track and the
 * progress bar via inline style. Kept out of the stylesheet on purpose: set
 * here, the CSS minifier never sees `animation-timeline` and so cannot fold it
 * into the `animation` shorthand (which would invalidate the declaration).
 *
 * Both pinned modes use it: in paged mode the step tween drives the document
 * scroll, and the track is the same pure function of that scroll position.
 * Returns whether the timeline is active, so painting can skip the JS path.
 */
function applyScrubTimeline(
  track: HTMLElement,
  progressBar: HTMLElement | null,
  active: boolean,
  scrollStart: number,
  scrollDistance: number,
  maxTranslate: number,
  rtl: boolean
): boolean {
  if (!SUPPORTS_SCROLL_TIMELINE || !active || scrollDistance <= 0) {
    track.style.removeProperty('--aa-hscroll-translate-end');
    setScrollAnimation(track, null, 0, 0);
    setScrollAnimation(progressBar, null, 0, 0);
    return false;
  }

  track.style.setProperty(
    '--aa-hscroll-translate-end',
    `${toSignedTranslate(maxTranslate, rtl)}px`
  );
  setScrollAnimation(track, 'aa-hscroll-scrub', scrollStart, scrollDistance);
  setScrollAnimation(
    progressBar,
    'aa-hscroll-progress',
    scrollStart,
    scrollDistance
  );
  return true;
}

function createPresentation(
  ref: HTMLElement,
  context: HScrollContext,
  progressElement: HTMLElement | null,
  progressBar: HTMLElement | null,
  liveRegion: HTMLElement | null,
  swipeHint: HTMLElement | null,
  prevButton: HTMLButtonElement | null,
  nextButton: HTMLButtonElement | null
): RuntimePresentation {
  let mode: HScrollMode = 'static';
  let slides: HTMLElement[] = [];
  let currentIndex = 0;
  let announcedIndex = -1;
  let swipeHintDismissed = false;
  /** Cached progress-bar active flag to avoid per-frame classList churn. */
  let progressActive: boolean | null = null;
  /** Last reported percentage, so the bar and ARIA update only on change. */
  let progressPercent = -1;
  let compositor = false;

  const updateSwipeHint = (): void => {
    const style = context.swipeHintStyle ?? 'cue';
    const visible = shouldShowSwipeHint({
      mode,
      slideCount: slides.length,
      currentIndex,
      dismissed: swipeHintDismissed,
      style,
    });

    ref.classList.toggle('is-swipe-hint-visible', visible);
    swipeHint?.toggleAttribute('hidden', !visible);
  };

  const syncControls = (index: number, slideCount: number): void => {
    const interactive = mode !== 'static' && slideCount > 1;
    if (prevButton) {
      prevButton.disabled = !interactive || index <= 0;
      prevButton.hidden = mode === 'static';
    }
    if (nextButton) {
      nextButton.disabled = !interactive || index >= slideCount - 1;
      nextButton.hidden = mode === 'static';
    }
  };

  /*
   * Deliberately no aria-hidden management here: in pinned/paged mode
   * several slides can be partially visible at once, and hiding focusable
   * content from assistive tech while it remains reachable is a WCAG
   * violation. Position is conveyed by each slide's aria-label plus the
   * polite live-region announcement instead.
   */

  return {
    getIndex: () => currentIndex,

    setMode(nextMode) {
      mode = nextMode;
      updateSwipeHint();
      syncControls(currentIndex, slides.length);
    },

    setSlides(nextSlides) {
      slides = nextSlides;
      currentIndex = clamp(currentIndex, 0, Math.max(0, slides.length - 1));
      announcedIndex = -1;

      // Re-measures run on any layout change; only touch attributes that
      // actually differ so assistive tech and observers see no churn.
      slides.forEach((slide, index) => {
        setAttributeIfChanged(slide, 'role', 'group');
        setAttributeIfChanged(slide, 'aria-roledescription', 'slide');
        setAttributeIfChanged(
          slide,
          'aria-label',
          formatSlideAnnouncement(
            index,
            slides.length,
            context.i18n?.slideLabel ?? '%1$s of %2$s'
          )
        );
      });

      updateSwipeHint();
      syncControls(currentIndex, slides.length);
    },

    setActive(index, options = {}) {
      if (slides.length === 0) return 0;

      const { announce = false } = options;
      const nextIndex = clamp(index, 0, slides.length - 1);

      // Fast path: called once per animation frame while scrolling, so skip
      // all DOM side effects when nothing observable changes.
      if (nextIndex !== currentIndex) {
        currentIndex = nextIndex;
        updateSwipeHint();
        syncControls(currentIndex, slides.length);
      }

      if (announce && announcedIndex !== currentIndex && liveRegion) {
        announcedIndex = currentIndex;
        liveRegion.textContent = formatSlideAnnouncement(
          currentIndex,
          slides.length,
          context.i18n?.slideAnnouncement
        );
      }

      return currentIndex;
    },

    setProgress(progress) {
      const bounded = clamp(progress, 0, 1);
      const nextProgress = progressToPercentage(bounded);
      const active =
        (mode === 'pinned' || mode === 'paged') &&
        bounded > 0.01 &&
        bounded < 0.99;

      // Written directly (not through reactive context): this runs every
      // scrolled frame, and only whole-percent changes are observable.
      if (progressPercent !== nextProgress) {
        progressPercent = nextProgress;
        progressElement?.setAttribute('aria-valuenow', String(nextProgress));
        if (progressBar && !compositor) {
          progressBar.style.transform = `scaleX(${nextProgress / 100})`;
        }
      }

      // Skip redundant classList work — called every animation frame while scrubbing.
      if (progressActive !== active) {
        progressActive = active;
        progressElement?.classList.toggle('is-active', active);
      }
    },

    setCompositor(active) {
      if (compositor === active) return;
      compositor = active;
      if (active) {
        progressBar?.style.removeProperty('transform');
      } else {
        progressPercent = -1;
      }
    },

    dismissSwipeHint() {
      if (swipeHintDismissed) return;
      swipeHintDismissed = true;
      updateSwipeHint();
    },

    syncControls,
  };
}

export function setupHorizontalScroll(
  ref: HTMLElement,
  context: HScrollContext
): () => void {
  runtimes.get(ref)?.();

  const range = ref.querySelector<HTMLElement>('.aa-hscroll__range') ?? ref;
  const viewport = ref.querySelector<HTMLElement>('.aa-hscroll__viewport');
  // The sticky, never-scrolled region that overlays controls on the viewport.
  const stage =
    ref.querySelector<HTMLElement>('.aa-hscroll__stage') ?? viewport;
  const track = ref.querySelector<HTMLElement>('.aa-hscroll__track');
  const progressElement = ref.querySelector<HTMLElement>(
    '.aa-hscroll__progress'
  );
  const progressBar = ref.querySelector<HTMLElement>(
    '.aa-hscroll__progress-bar'
  );
  const liveRegion = ref.querySelector<HTMLElement>('.aa-hscroll__live-region');
  const swipeHint = ref.querySelector<HTMLElement>('.aa-hscroll__swipe-hint');
  const prevButton = ref.querySelector<HTMLButtonElement>(
    '.aa-hscroll__control--prev'
  );
  const nextButton = ref.querySelector<HTMLButtonElement>(
    '.aa-hscroll__control--next'
  );

  if (!viewport || !track) return () => {};

  const elements: ControllerElements = { ref, viewport };
  const presentation = createPresentation(
    ref,
    context,
    progressElement,
    progressBar,
    liveRegion,
    swipeHint,
    prevButton,
    nextButton
  );
  const desktopMedia = window.matchMedia(DESKTOP_QUERY);
  const reducedMotionMedia = window.matchMedia(REDUCED_MOTION_QUERY);
  const abortController = new AbortController();
  const mediaCleanups: Array<() => void> = [];
  const observedSlides = new Set<HTMLElement>();
  /*
   * The keyboard stop is the viewport — the labelled carousel region, one
   * screen tall. The section spans the whole scroll range (thousands of px),
   * and focusing that made the browser centre it: Tab landed mid-gallery.
   * In native mode the viewport is also the element that actually scrolls.
   */
  const focusTarget = viewport;
  const hadTabindex = focusTarget.hasAttribute('tabindex');
  const originalTabindex = focusTarget.getAttribute('tabindex');

  let mode: HScrollMode | null = null;
  let controller: Controller | null = null;
  let geometry: Geometry | null = null;
  let measureFrame = 0;
  let destroyed = false;

  const restoreTabstop = (): void => {
    if (hadTabindex && originalTabindex !== null) {
      setAttributeIfChanged(focusTarget, 'tabindex', originalTabindex);
    } else if (!hadTabindex) {
      focusTarget.removeAttribute('tabindex');
    }
  };

  const MODE_CLASS_SETS: Record<HScrollMode, readonly string[]> = {
    static: ['is-static'],
    native: ['is-horizontal', 'is-snap'],
    paged: ['is-horizontal', 'is-enhanced', 'is-paged'],
    pinned: ['is-horizontal', 'is-enhanced'],
  };

  const applyMode = (nextMode: HScrollMode, scrollDistance: number): void => {
    // Reconcile the full class set (measure() adds a temporary is-horizontal
    // before reading layout), but toggle each class to its target state so
    // an unchanged mode causes no mutation and no style recalculation.
    const wanted = new Set(MODE_CLASS_SETS[nextMode]);
    MODE_CLASSES.forEach(className => {
      if (ref.classList.contains(className) !== wanted.has(className)) {
        ref.classList.toggle(className, wanted.has(className));
      }
    });

    const distance =
      nextMode === 'pinned' || nextMode === 'paged'
        ? `${scrollDistance}px`
        : '';
    if (ref.style.getPropertyValue('--aa-hscroll-distance') !== distance) {
      if (distance) {
        ref.style.setProperty('--aa-hscroll-distance', distance);
      } else {
        ref.style.removeProperty('--aa-hscroll-distance');
      }
    }

    if (nextMode === 'static') {
      restoreTabstop();
    } else if (!hadTabindex) {
      setAttributeIfChanged(focusTarget, 'tabindex', '0');
    }
  };

  const resizeObserver =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => scheduleMeasure());

  const observeSlides = (slides: HTMLElement[]): void => {
    if (!resizeObserver) return;

    const liveSlides = new Set(slides);
    observedSlides.forEach(slide => {
      if (!liveSlides.has(slide)) {
        resizeObserver.unobserve(slide);
        observedSlides.delete(slide);
      }
    });

    slides.forEach(slide => {
      if (observedSlides.has(slide)) return;
      resizeObserver.observe(slide);
      observedSlides.add(slide);
    });
  };

  const measure = (): void => {
    measureFrame = 0;
    if (destroyed) return;

    if (!reducedMotionMedia.matches) {
      ref.classList.add('is-horizontal');
    }

    const slides = getSlides(track);
    const maxTranslate = reducedMotionMedia.matches
      ? 0
      : Math.max(0, track.scrollWidth - viewport.clientWidth);
    const speed = resolveSpeed(
      Number(context.speed),
      parseFloat(
        window.getComputedStyle(ref).getPropertyValue('--aa-hscroll-speed')
      )
    );
    const scrollDistance = Math.ceil(maxTranslate * speed);
    const snapBehavior = normalizeSnapBehavior(context.snapBehavior);
    const nextMode = pickMode({
      reducedMotion: reducedMotionMedia.matches,
      desktopMatches: desktopMedia.matches,
      maxTranslate,
      pinned: context.desktopBehavior !== 'inline',
      snapBehavior,
    });

    applyMode(nextMode, scrollDistance);

    const stickyTop =
      nextMode === 'pinned' || nextMode === 'paged'
        ? parseFloat(window.getComputedStyle(stage ?? viewport).top) || 0
        : 0;
    const scrollStart = computeScrollStart(
      window.scrollY + range.getBoundingClientRect().top,
      stickyTop
    );
    const rtl = window.getComputedStyle(ref).direction === 'rtl';
    const logicalOffsets = toLogicalSlideOffsets({
      offsets: slides.map(slide => slide.offsetLeft - track.offsetLeft),
      sizes: slides.map(slide => slide.offsetWidth),
      trackSize: track.scrollWidth,
      rtl,
    });
    const slideStops = buildSlideStops(logicalOffsets, maxTranslate);
    const stepDurationMs = resolveStepDurationMs(context.stepDuration);
    const compositor = applyScrubTimeline(
      track,
      progressBar,
      nextMode === 'pinned' || nextMode === 'paged',
      scrollStart,
      scrollDistance,
      maxTranslate,
      rtl
    );
    presentation.setCompositor(compositor);

    geometry = {
      slides,
      slideStops,
      maxTranslate,
      scrollDistance,
      scrollStart,
      rtl,
      stepDurationMs,
      compositor,
    };

    presentation.setSlides(slides);
    presentation.setMode(nextMode);
    observeSlides(slides);

    if (mode !== nextMode) {
      controller?.destroy();
      mode = nextMode;
      controller = createController(nextMode, elements, presentation, geometry);
    } else {
      controller?.updateGeometry(geometry);
    }
  };

  function scheduleMeasure(): void {
    if (measureFrame || destroyed) return;
    measureFrame = window.requestAnimationFrame(measure);
  }

  const mutationObserver =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(scheduleMeasure);

  resizeObserver?.observe(viewport);
  resizeObserver?.observe(track);
  // Content above the block (lazy images, embeds, toggled sections) shifts the
  // block's document position and would leave scrollStart stale. Observing the
  // body catches those layout changes; the re-measure is rAF-batched and
  // settles immediately when nothing actually changed.
  resizeObserver?.observe(document.body);
  mutationObserver?.observe(track, { childList: true });
  mediaCleanups.push(
    addMediaChangeListener(desktopMedia, scheduleMeasure),
    addMediaChangeListener(reducedMotionMedia, scheduleMeasure)
  );

  window.addEventListener('resize', scheduleMeasure, {
    passive: true,
    signal: abortController.signal,
  });

  /**
   * Reveal prev/next only for Tab / focus-visible keyboard users — not for
   * Arrow Up/Down slide paging (those keys must work without showing chrome).
   */
  const setKeyboardChrome = (on: boolean): void => {
    if (on) {
      ref.dataset.aaHscrollKeyboard = '';
    } else {
      delete ref.dataset.aaHscrollKeyboard;
    }
  };

  // Window capture so Arrow / Page (and Space, when paged) page slides while
  // the gallery owns the scroll range — no Tab-focus required, matching wheel
  // ownership. shouldIgnoreKeyboardEvent keeps browser shortcuts, text entry,
  // widgets, and dialogs out of it; Home/End need focus inside the gallery.
  window.addEventListener(
    'keydown',
    event => {
      if (!controller || !geometry) return;

      // Tab into the gallery → show controls. Arrow paging stays chrome-free.
      if (
        event.key === 'Tab' &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        window.requestAnimationFrame(() => {
          if (ref.contains(document.activeElement)) {
            setKeyboardChrome(true);
          }
        });
      }

      if (shouldIgnoreKeyboardEvent(event, ref)) return;
      if (JUMP_KEYS.has(event.key) && !ref.contains(document.activeElement)) {
        return;
      }

      const intent = resolveKeyboardIntent({
        key: event.key,
        shiftKey: event.shiftKey,
        rtl: geometry.rtl,
        allowSpace: mode === 'paged',
      });
      if (intent && controller.keydown(intent)) {
        event.preventDefault();
      }
    },
    { capture: true, signal: abortController.signal }
  );

  window.addEventListener(
    'pointerdown',
    event => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      if (event.target instanceof Node && ref.contains(event.target)) return;
      setKeyboardChrome(false);
    },
    { capture: true, signal: abortController.signal }
  );

  const onControlClick = (direction: 1 | -1): void => {
    if (controller?.step(direction)) {
      presentation.dismissSwipeHint();
    }
  };

  prevButton?.addEventListener('click', () => onControlClick(-1), {
    signal: abortController.signal,
  });
  nextButton?.addEventListener('click', () => onControlClick(1), {
    signal: abortController.signal,
  });

  // Keyboard/AT users can Tab into content on a not-yet-visible slide. The
  // browser then auto-scrolls the overflow:hidden viewport to reveal it,
  // which visually corrupts the transform-driven track. Undo that native
  // scroll and jump the *document* to the slide's stop instead, so focus and
  // the pinned animation stay in agreement.
  ref.addEventListener(
    'focusin',
    event => {
      if (
        event.target instanceof HTMLElement &&
        event.target.matches(':focus-visible')
      ) {
        setKeyboardChrome(true);
      }

      if (
        (mode !== 'pinned' && mode !== 'paged') ||
        !geometry ||
        !(event.target instanceof HTMLElement)
      ) {
        return;
      }

      viewport.scrollLeft = 0;

      const target = event.target;
      const slideIndex = geometry.slides.findIndex(slide =>
        slide.contains(target)
      );
      if (slideIndex < 0) return;

      const top =
        geometry.scrollStart +
        (geometry.slideStops[slideIndex] ?? 0) * geometry.scrollDistance;

      if (Math.abs(window.scrollY - top) > 1) {
        window.scrollTo({ top, behavior: 'auto' });
      }
    },
    { signal: abortController.signal }
  );

  if (document.fonts) {
    document.fonts.ready.then(() => {
      if (!destroyed) scheduleMeasure();
    });
  }

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;

    window.cancelAnimationFrame(measureFrame);
    abortController.abort();
    controller?.destroy();
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    mediaCleanups.forEach(cleanup => cleanup());
    MODE_CLASSES.forEach(className => ref.classList.remove(className));
    ref.style.removeProperty('--aa-hscroll-distance');
    ref.style.removeProperty('--aa-hscroll-x');
    applyScrubTimeline(track, progressBar, false, 0, 0, 0, false);
    progressBar?.style.removeProperty('transform');
    progressElement?.classList.remove('is-active');
    restoreTabstop();
    delete ref.dataset.aaHscrollKeyboard;
    runtimes.delete(ref);
  };

  runtimes.set(ref, destroy);
  scheduleMeasure();

  return destroy;
}
