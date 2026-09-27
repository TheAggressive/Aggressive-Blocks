/**
 * Horizontal-scroll block — shared types for the Interactivity context that
 * render.php writes and the runtime reads.
 */

import type { SnapBehavior, SwipeHintStyle } from './logic';

export interface HScrollI18n {
  /** sprintf-style template for the live announcement, e.g. "Slide %1$s of %2$s". */
  slideAnnouncement?: string;
  /** sprintf-style template for each slide's aria-label, e.g. "%1$s of %2$s". */
  slideLabel?: string;
}

export interface HScrollContext {
  speed: number;
  desktopBehavior?: 'pinned' | 'inline';
  snapBehavior?: SnapBehavior;
  /** Author step glide length in seconds (0.2–2). */
  stepDuration?: number;
  swipeHintStyle?: SwipeHintStyle;
  i18n?: HScrollI18n;
}
