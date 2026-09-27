import {
  clamp,
  getDirectionalSlideIndex,
  getSlideIndexFromProgress,
  getSlideTarget,
  resolveAbsoluteIntent,
  type KeyboardIntent,
} from '../logic';
import { STOP_EPSILON_PX } from './step-constants';
import type {
  Controller,
  ControllerElements,
  Geometry,
  Presentation,
} from './types';

/** Fallback settle delay where the `scrollend` event is unavailable. */
const SETTLE_FALLBACK_MS = 150;

/**
 * Touch / narrow-viewport mode: the viewport is a native horizontal
 * scroll-snap carousel. Swipes, the scrollbar, and Shift+wheel scroll it
 * natively; this controller mirrors the position into the presentation and
 * announces the slide once scrolling settles.
 */
export class NativeCarouselController implements Controller {
  private geometry: Geometry;
  private readonly abortController = new AbortController();
  private readonly supportsScrollEnd = 'onscrollend' in window;
  private frame = 0;
  private settleTimer = 0;

  constructor(
    private readonly elements: ControllerElements,
    private readonly presentation: Presentation,
    geometry: Geometry
  ) {
    this.geometry = geometry;
    const { signal } = this.abortController;
    const { viewport } = this.elements;

    viewport.addEventListener('scroll', this.onScroll, {
      passive: true,
      signal,
    });
    if (this.supportsScrollEnd) {
      viewport.addEventListener('scrollend', this.settle, {
        passive: true,
        signal,
      });
    }
    this.render();
  }

  /** Logical scroll distance from the inline-start edge (RTL-safe). */
  private getScrolled = (): number =>
    Math.abs(this.elements.viewport.scrollLeft);

  private progress = (): number =>
    this.geometry.maxTranslate > 0
      ? clamp(this.getScrolled() / this.geometry.maxTranslate, 0, 1)
      : 0;

  /** Scroll to a logical offset — RTL viewports scroll into negative left. */
  private scrollToOffset = (offset: number, behavior: ScrollBehavior): void => {
    this.elements.viewport.scrollTo({
      left: this.geometry.rtl ? -offset : offset,
      behavior,
    });
  };

  updateGeometry = (geometry: Geometry): void => {
    const previousProgress = this.progress();
    this.geometry = geometry;

    if (previousProgress > 0) {
      this.scrollToOffset(previousProgress * geometry.maxTranslate, 'auto');
    }
    this.render();
  };

  keydown = (intent: KeyboardIntent): boolean => {
    // The carousel scrolls horizontally inside the page, so it only takes
    // keys while focus is within it; otherwise they scroll the page.
    const active = document.activeElement;
    if (!(active instanceof Node) || !this.elements.ref.contains(active)) {
      return false;
    }

    const target =
      resolveAbsoluteIntent(intent, this.geometry.slides.length) ??
      this.directionalTarget(intent === 'next' ? 1 : -1);

    return this.goTo(target);
  };

  step = (direction: 1 | -1): boolean =>
    this.goTo(this.directionalTarget(direction));

  destroy = (): void => {
    this.abortController.abort();
    window.cancelAnimationFrame(this.frame);
    window.clearTimeout(this.settleTimer);
  };

  private directionalTarget = (direction: 1 | -1): number =>
    getDirectionalSlideIndex(
      this.progress(),
      this.geometry.slideStops,
      direction,
      this.geometry.maxTranslate > 0
        ? STOP_EPSILON_PX / this.geometry.maxTranslate
        : 0
    );

  /** Returns false when already at that slide (boundary keys fall through). */
  private goTo = (index: number): boolean => {
    if (this.geometry.slides.length === 0) return false;

    const offset = getSlideTarget(
      index,
      this.geometry.slideStops,
      this.geometry.maxTranslate
    );
    if (Math.abs(this.getScrolled() - offset) < STOP_EPSILON_PX) return false;

    this.scrollToOffset(offset, 'smooth');
    // Announce immediately so keyboard users hear the new position.
    this.presentation.setActive(index, { announce: true });
    return true;
  };

  private onScroll = (): void => {
    if (!this.frame) {
      this.frame = window.requestAnimationFrame(this.render);
    }

    if (!this.supportsScrollEnd) {
      window.clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(this.settle, SETTLE_FALLBACK_MS);
    }
  };

  /**
   * Announce the slide a swipe (or scrollbar drag) came to rest on. Repeats
   * are suppressed by the presentation, so a keyboard step that already
   * announced its target stays quiet here.
   */
  private settle = (): void => {
    this.presentation.setActive(
      getSlideIndexFromProgress(this.progress(), this.geometry.slideStops),
      { announce: true }
    );
  };

  private render = (): void => {
    this.frame = 0;
    const progress = this.progress();

    this.presentation.setActive(
      getSlideIndexFromProgress(progress, this.geometry.slideStops)
    );
    this.presentation.setProgress(progress);

    if (this.getScrolled() > 1) {
      this.presentation.dismissSwipeHint();
    }
  };
}
