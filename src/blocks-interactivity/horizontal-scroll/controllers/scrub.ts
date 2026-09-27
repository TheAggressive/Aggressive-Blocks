import {
  computeProgress,
  getDirectionalSlideIndex,
  getStepScrollPosition,
  isScrollInPinnedRange,
  resolveAbsoluteIntent,
  type KeyboardIntent,
} from '../logic';
import { paintScrollPosition } from './paint';
import { RANGE_SLACK_PX, STOP_EPSILON_PX } from './step-constants';
import type {
  Controller,
  ControllerElements,
  Geometry,
  Presentation,
} from './types';

/**
 * Continuous "scrub" mode: the pinned track glides horizontally in lock-step
 * with vertical scroll.
 *
 * The track's horizontal position is a pure function of the document scroll
 * offset. Where scroll-driven animations exist it runs on the compositor and
 * this controller only keeps the active slide, progress value, and controls
 * current; elsewhere it also writes `--aa-hscroll-x` once per frame. Every
 * scroll source (wheel, scrollbar, Space, find-in-page, assistive tech) is
 * followed, never fought.
 */
export class ScrubController implements Controller {
  private geometry: Geometry;
  private readonly abortController = new AbortController();
  private frame = 0;

  constructor(
    private readonly elements: ControllerElements,
    private readonly presentation: Presentation,
    geometry: Geometry
  ) {
    this.geometry = geometry;

    window.addEventListener('scroll', this.scheduleRender, {
      passive: true,
      signal: this.abortController.signal,
    });

    this.render();
  }

  updateGeometry = (geometry: Geometry): void => {
    this.geometry = geometry;
    this.render();
  };

  keydown = (intent: KeyboardIntent): boolean => {
    // Only page while the reader is inside the pinned range; elsewhere the
    // keys scroll the page as usual.
    if (!this.isInRange()) return false;

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
  };

  private progress = (): number =>
    computeProgress(
      window.scrollY,
      this.geometry.scrollStart,
      this.geometry.scrollDistance
    );

  private isInRange = (): boolean =>
    isScrollInPinnedRange({
      scrollY: window.scrollY,
      scrollStart: this.geometry.scrollStart,
      scrollDistance: this.geometry.scrollDistance,
      slackPx: RANGE_SLACK_PX,
    });

  private stopPosition = (index: number): number =>
    getStepScrollPosition(
      index,
      this.geometry.scrollStart,
      this.geometry.scrollDistance,
      this.geometry.slideStops
    );

  private directionalTarget = (direction: 1 | -1): number =>
    getDirectionalSlideIndex(
      this.progress(),
      this.geometry.slideStops,
      direction,
      this.geometry.scrollDistance > 0
        ? STOP_EPSILON_PX / this.geometry.scrollDistance
        : 0
    );

  /**
   * Scroll the document to a slide's stop. Returns false when already there,
   * so a boundary key falls through to normal page scrolling.
   */
  private goTo = (index: number): boolean => {
    if (this.geometry.slides.length === 0) return false;

    const top = this.stopPosition(index);
    if (Math.abs(window.scrollY - top) < STOP_EPSILON_PX) return false;

    window.scrollTo({ top, behavior: 'smooth' });
    // Announce now; the smooth scroll (and per-frame render) catch up.
    this.presentation.setActive(index, { announce: true });
    return true;
  };

  private scheduleRender = (): void => {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(this.render);
  };

  private render = (): void => {
    this.frame = 0;
    paintScrollPosition(
      this.elements.ref,
      this.presentation,
      this.geometry,
      window.scrollY
    );
  };
}
