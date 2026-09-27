import {
  computeProgress,
  getSlideIndexFromProgress,
  toSignedTranslate,
} from '../logic';
import type { Geometry, Presentation } from './types';

/**
 * Apply a document scroll position to the track transform and the presentation
 * layer. Shared by the scrub and step controllers so both render identically —
 * only *how* each arrives at the scroll position differs (free scroll vs. an
 * eased tween). The active-slide update is silent; settle announcements are made
 * by the caller.
 */
export function paintScrollPosition(
  ref: HTMLElement,
  presentation: Presentation,
  geometry: Geometry,
  position: number
): void {
  const progress = computeProgress(
    position,
    geometry.scrollStart,
    geometry.scrollDistance
  );

  // On a compositor scroll timeline the browser already moves the track;
  // writing the custom property would restyle every slide each frame for
  // nothing. The JS path remains the fallback where timelines are missing.
  if (!geometry.compositor) {
    ref.style.setProperty(
      '--aa-hscroll-x',
      `${toSignedTranslate(progress * geometry.maxTranslate, geometry.rtl)}px`
    );
  }

  presentation.setActive(
    getSlideIndexFromProgress(progress, geometry.slideStops)
  );
  presentation.setProgress(progress);
}
