/**
 * Horizontal-scroll presentation layer: everything readers and assistive tech
 * observe — slide roles and labels, the live announcement, the progress bar,
 * prev/next state, and the swipe hint. Controllers drive it through the
 * narrow {@link Presentation} interface; the runtime also sets mode, slides,
 * and whether the progress bar runs on the compositor.
 *
 * Every setter is called per scrolled frame, so each writes to the DOM only
 * when its observable value changes.
 */

import {
  clamp,
  formatSlideAnnouncement,
  progressToPercentage,
  setAttributeIfChanged,
  shouldShowSwipeHint,
  type HScrollMode,
} from './logic';
import type { Presentation } from './controllers';
import type { HScrollContext } from './types';

export interface RuntimePresentation extends Presentation {
  setMode: (mode: HScrollMode) => void;
  setSlides: (slides: HTMLElement[]) => void;
  /** Whether the progress bar runs on the compositor timeline. */
  setCompositor: (active: boolean) => void;
}

/** The optional chrome the block renders (each can be switched off). */
export interface PresentationElements {
  progressElement: HTMLElement | null;
  progressBar: HTMLElement | null;
  liveRegion: HTMLElement | null;
  swipeHint: HTMLElement | null;
  prevButton: HTMLButtonElement | null;
  nextButton: HTMLButtonElement | null;
}

export function createPresentation(
  ref: HTMLElement,
  context: HScrollContext,
  elements: PresentationElements
): RuntimePresentation {
  const {
    progressElement,
    progressBar,
    liveRegion,
    swipeHint,
    prevButton,
    nextButton,
  } = elements;
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

  /*
   * aria-disabled, not disabled: a keyboard user who presses Next onto the
   * last slide is still focused on Next, and disabling a focused button drops
   * focus to <body>. The controllers already ignore a step past either end.
   */
  const setControlDisabled = (
    button: HTMLButtonElement,
    disabled: boolean
  ): void => {
    if (disabled) {
      setAttributeIfChanged(button, 'aria-disabled', 'true');
    } else {
      button.removeAttribute('aria-disabled');
    }
  };

  const syncControls = (index: number, slideCount: number): void => {
    const interactive = mode !== 'static' && slideCount > 1;
    if (prevButton) {
      setControlDisabled(prevButton, !interactive || index <= 0);
      prevButton.hidden = mode === 'static';
    }
    if (nextButton) {
      setControlDisabled(nextButton, !interactive || index >= slideCount - 1);
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
  };
}
