/**
 * Card Flip Block — Interactivity API Store.
 *
 * One model for both variants: the toggle button drives `context.isFlipped`
 * (keyboard / touch / reduced-motion accessible), CSS performs the 3D flip, and
 * `syncFaces` marks the away-facing side `inert` so its content leaves the tab
 * order and accessibility tree. The hover variant mirrors the same state from
 * a mouse pointer, so `inert` and `aria-pressed` stay correct either way.
 *
 * @package Aggressive_Blocks
 */

/// <reference types="@wordpress/interactivity" />
import { store, getContext, getElement } from '@wordpress/interactivity';

interface CardFlipContext {
  isFlipped: boolean;
  flipOn: 'hover' | 'click';
}

/**
 * Keep the away-facing side out of the tab order / accessibility tree while
 * both faces stay in the DOM for the 3D flip. Uses `inert` (not `hidden`) so
 * the flip animation is preserved. Only this card's own faces are touched, so
 * a card nested inside a face keeps its own state. Exported for unit testing.
 */
export function applyFaceInert(root: Element, isFlipped: boolean): void {
  const front = root.querySelector(
    ':scope > .aa-card-flip__inner > .aa-card-flip__face--front'
  );
  const back = root.querySelector(
    ':scope > .aa-card-flip__inner > .aa-card-flip__face--back'
  );
  const turningAway = isFlipped ? front : back;

  // Inerting the face that holds focus would drop focus to <body>; hand it to
  // the flip control so keyboard and screen reader users keep their place.
  if (turningAway?.contains(root.ownerDocument.activeElement)) {
    root.querySelector<HTMLElement>(':scope > .aa-card-flip__toggle')?.focus();
  }

  front?.toggleAttribute('inert', isFlipped);
  back?.toggleAttribute('inert', !isFlipped);
}

/**
 * Only a real mouse drives the hover flip. A touch tap fires pointerenter
 * right before the click on the flip button, which would flip the card and
 * then immediately flip it back.
 */
export function isHoverPointer(event: PointerEvent): boolean {
  return event.pointerType === 'mouse';
}

store('aggressive-blocks/card-flip', {
  actions: {
    toggle(): void {
      const ctx = getContext<CardFlipContext>();
      ctx.isFlipped = !ctx.isFlipped;
    },

    pointerEnter(event: PointerEvent): void {
      if (isHoverPointer(event)) {
        getContext<CardFlipContext>().isFlipped = true;
      }
    },

    pointerLeave(event: PointerEvent): void {
      if (isHoverPointer(event)) {
        getContext<CardFlipContext>().isFlipped = false;
      }
    },

    // Escape turns a flipped card back to its front (WCAG 1.4.13 dismissal).
    // Skipped when a nested card already handled it or it closes a dialog.
    keydown(event: KeyboardEvent): void {
      const ctx = getContext<CardFlipContext>();
      if (
        event.key !== 'Escape' ||
        !ctx.isFlipped ||
        event.defaultPrevented ||
        (event.target as Element | null)?.closest?.('dialog')
      ) {
        return;
      }
      event.preventDefault();
      ctx.isFlipped = false;
    },
  },

  callbacks: {
    // Runs on hydration and whenever isFlipped changes.
    syncFaces(): void {
      const ctx = getContext<CardFlipContext>();
      const { ref } = getElement();
      if (ref) {
        applyFaceInert(ref, ctx.isFlipped);
      }
    },
  },
});
