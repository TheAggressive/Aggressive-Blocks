/**
 * Horizontal Scroll Block — Interactivity API entry point.
 *
 * Runtime behavior lives in isolated controllers; this file only connects the
 * block context and element to the WordPress Interactivity API store. The
 * progress bar is written by the runtime directly (or runs on a compositor
 * scroll timeline), not through reactive bindings: it changes every scrolled
 * frame.
 */

/// <reference types="@wordpress/interactivity" />
import { store, getContext, getElement } from '@wordpress/interactivity';
import { setupHorizontalScroll, type HScrollContext } from './runtime';

interface HScrollStore {
  callbacks: {
    init: () => void | (() => void);
  };
}

store<HScrollStore>('aggressive-blocks/horizontal-scroll', {
  callbacks: {
    init() {
      const context = getContext<HScrollContext>();
      const { ref } = getElement();

      if (!(ref instanceof HTMLElement)) return;
      return setupHorizontalScroll(ref, context);
    },
  },
});
