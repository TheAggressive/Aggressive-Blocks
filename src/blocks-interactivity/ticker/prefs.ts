/**
 * Ticker block — visitor preference helpers.
 *
 * @package Aggressive_Blocks
 */

import { PAUSE_STORAGE_KEY } from './constants';

/** Whether the visitor prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * True when hover is a real primary input (fine pointer + hover capability).
 *
 * Touch devices often synthesize sticky `mouseenter` on tap; using that for
 * pause-on-hover traps the marquee in a held state after the pause control
 * is used. Match the CSS that always shows the pause button on coarse pointers.
 */
export function canUseHoverPause(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

/**
 * Whether the visitor paused a ticker on an earlier page. Storage can be
 * unavailable or throw (private mode, blocked site data) — treat as unset.
 */
export function readStoredPause(): boolean {
  try {
    return window.localStorage.getItem(PAUSE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remember (or forget) the visitor's manual pause for later pages. */
export function writeStoredPause(paused: boolean): void {
  try {
    if (paused) {
      window.localStorage.setItem(PAUSE_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(PAUSE_STORAGE_KEY);
    }
  } catch {
    // Unavailable storage just means the pause lasts for this page only.
  }
}

/**
 * Resolve after document fonts are ready so content widths are final.
 * Falls back immediately when the Font Loading API is unavailable.
 */
export function whenDocumentFontsReady(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    return document.fonts.ready.then(() => undefined);
  }

  return Promise.resolve();
}
