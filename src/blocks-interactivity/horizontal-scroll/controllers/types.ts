import type { KeyboardIntent } from '../logic';

export interface Geometry {
  slides: HTMLElement[];
  slideStops: number[];
  maxTranslate: number;
  scrollDistance: number;
  scrollStart: number;
  /** Whether the block renders in a right-to-left writing direction. */
  rtl: boolean;
  /** Directional snap glide duration in milliseconds. */
  stepDurationMs: number;
  /**
   * Whether the track (and progress bar) run on a compositor scroll timeline.
   * When true, painting skips the per-frame transform writes the browser is
   * already doing; only state that screen readers and controls read updates.
   */
  compositor: boolean;
}

export interface Controller {
  updateGeometry: (geometry: Geometry) => void;
  /**
   * Handle a keyboard paging intent (already filtered and resolved by the
   * runtime). Returns true when consumed, so the runtime prevents default.
   */
  keydown: (intent: KeyboardIntent) => boolean;
  /**
   * Move one slide in reading order from the current position (prev/next
   * controls). Returns false at a boundary.
   */
  step: (direction: 1 | -1) => boolean;
  destroy: () => void;
}

export interface ControllerElements {
  ref: HTMLElement;
  viewport: HTMLElement;
}

export interface Presentation {
  setActive: (index: number, options?: { announce?: boolean }) => number;
  setProgress: (progress: number) => void;
  dismissSwipeHint: () => void;
}
