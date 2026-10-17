/**
 * Modal block — highlight and visual feedback for modal trigger blocks in
 * the editor. Finding blocks and triggers across editor documents lives in
 * editor-dom.ts.
 */

import {
  findBlockDomElement,
  findTriggerElement,
  getOwnerView,
  ownerDocumentContains,
} from './editor-dom';
import { Debug } from './utils/debug';

interface HighlightInfo {
  targetElement: HTMLElement;
  styleTag: HTMLStyleElement;
}

interface HighlightResult {
  highlighted: boolean;
  element: Element | null;
}

interface TrackedListener {
  element: EventTarget;
  eventType: string;
  callback: EventListener;
}

interface HighlightData {
  highlights: HTMLElement[];
  tooltips: HTMLElement[];
  pulseElements: HTMLElement[];
  timers: ReturnType<typeof setTimeout>[];
  eventListeners: TrackedListener[];
  resizeObserver: ResizeObserver | null;
}

const directHighlights = new Map<
  HTMLElement,
  {
    styles: Array<{ name: string; value: string; priority: string }>;
    hadHighlightClass: boolean;
  }
>();
const styleElements = new Set<HTMLStyleElement>();
let highlightSequence = 0;
const DIRECT_STYLE_PROPERTIES = [
  'position',
  'z-index',
  'outline',
  'outline-offset',
  'box-shadow',
  'animation',
] as const;

const highlightData: HighlightData = {
  highlights: [],
  tooltips: [],
  pulseElements: [],
  timers: [],
  eventListeners: [],
  resizeObserver: null,
};

/** Remove editor highlights and restore the styles they replaced. */
export const cleanupAllHighlights = (): void => {
  // Remove event listeners tracked in highlightData.
  highlightData.eventListeners.forEach(({ element, eventType, callback }) => {
    element.removeEventListener(eventType, callback);
  });
  highlightData.eventListeners = [];

  // Clear timers tracked in highlightData.
  highlightData.timers.forEach(timer => clearTimeout(timer));
  highlightData.timers = [];

  // Disconnect resize observer.
  if (highlightData.resizeObserver) {
    highlightData.resizeObserver.disconnect();
    highlightData.resizeObserver = null;
  }

  // Remove appended DOM elements (highlights, tooltips, pulse rings).
  [
    ...highlightData.highlights,
    ...highlightData.tooltips,
    ...highlightData.pulseElements,
  ].forEach(el => el?.parentNode?.removeChild(el));
  highlightData.highlights = [];
  highlightData.tooltips = [];
  highlightData.pulseElements = [];

  // Restore only properties changed by our direct highlight, including
  // !important priorities. Never scan unrelated editor styles by color.
  directHighlights.forEach(({ styles, hadHighlightClass }, element) => {
    styles.forEach(({ name, value, priority }) => {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    });
    if (!hadHighlightClass) element.classList.remove('modal-highlight-target');
  });
  directHighlights.clear();
  styleElements.forEach(style => style.remove());
  styleElements.clear();
};

export const removeHighlight = cleanupAllHighlights;

/**
 * Global function to add animation to a trigger element
 * This can be called from anywhere in the codebase
 *
 * @param triggerElement         - The DOM element to highlight or null to find by ID
 * @param modalId                - The modal ID
 * @param selectedTriggerBlockId - The client ID of the trigger block
 * @param _options               - Optional settings for the highlight (reserved)
 * @return Information about whether the highlight was applied
 */
export const highlightModalTrigger = (
  triggerElement: HTMLElement | null,
  modalId: string,
  selectedTriggerBlockId: string,
  _options: { discreet?: boolean } = {}
): HighlightResult => {
  // Remove any existing highlight first.
  cleanupAllHighlights();

  Debug.add(`Attempting to highlight trigger for modal ${modalId}`);
  Debug.add(`Trigger block ID: ${selectedTriggerBlockId}`);

  // If no trigger element provided, try to find it by ID.
  if (!triggerElement && selectedTriggerBlockId) {
    Debug.add(
      `No trigger element provided, searching for ${selectedTriggerBlockId}`
    );

    // Search for the element in the editor canvas.
    const blockElement = findBlockDomElement(selectedTriggerBlockId);

    if (blockElement) {
      Debug.add('Found block element in editor canvas');

      // Make sure the element has the correct modal-trigger class.
      // This check helps ensure the DOM reflects the block attributes.
      if (!blockElement.className.includes(`modal-trigger-${modalId}`)) {
        Debug.add(`Adding missing modal-trigger-${modalId} class to element`);
        blockElement.classList.add(`modal-trigger-${modalId}`);
      }

      // First try to find a specific trigger inside the block (button, link, etc.).
      let targetElement: HTMLElement;

      // Look for a button element or link inside the block.
      const buttonOrLink = blockElement.querySelector<HTMLElement>(
        'a, button, .wp-block-button__link, [role="button"]'
      );
      if (buttonOrLink) {
        Debug.add('Found button or link inside the block');
        targetElement = buttonOrLink;
      } else {
        // If no specific trigger element found, use the block itself.
        Debug.add('Using block element itself as target');
        targetElement = blockElement as HTMLElement;
      }

      // Create standard highlight with the selected target.
      const highlightInfo = createDirectHighlight(targetElement, modalId);

      if (highlightInfo) {
        return {
          highlighted: true,
          element: targetElement,
        };
      }
    } else {
      Debug.add(
        `Could not find block element for ID: ${selectedTriggerBlockId}`
      );
    }
  } else if (triggerElement) {
    // Use the provided element directly.
    Debug.add('Using provided trigger element');

    // Create direct highlight with the provided element.
    const highlightInfo = createDirectHighlight(triggerElement, modalId);

    if (highlightInfo) {
      return {
        highlighted: true,
        element: triggerElement,
      };
    }
  }

  Debug.add('Could not highlight modal trigger');
  return {
    highlighted: false,
    element: null,
  };
};

/**
 * Highlights a trigger block for a modal
 *
 * @param triggerBlockId - The client ID of the trigger block
 * @param modalId        - The ID of the modal being triggered
 * @param showPulse      - Whether to add a pulse animation
 * @param tooltipText    - Text to show in the tooltip
 */
export const highlightTriggerBlock = (
  triggerBlockId: string,
  modalId: string,
  showPulse = true,
  tooltipText = ''
): void => {
  // Clean up any existing highlights first.
  cleanupAllHighlights();

  if (!triggerBlockId || !modalId) {
    return;
  }

  // Find the block element.
  const blockElement = findBlockDomElement(triggerBlockId);
  if (!blockElement) {
    Debug.add(`Could not find block element with ID: ${triggerBlockId}`, true);
    return;
  }

  // Find the trigger element within the block.
  let triggerElement = findTriggerElement(blockElement, modalId);

  // If no specific trigger found, use the block element itself.
  if (!triggerElement) {
    triggerElement = blockElement;
  }

  // Overlays must live in the same document as the trigger (canvas iframe in 7.1).
  const ownerDoc = triggerElement.ownerDocument;
  const ownerView = getOwnerView(triggerElement);
  const ownerRoot = ownerDoc.documentElement;
  const ownerBody = ownerDoc.body;

  // Get position of the trigger within its document.
  const rect = triggerElement.getBoundingClientRect();
  const scrollX = ownerView?.scrollX ?? ownerRoot.scrollLeft;
  const scrollY = ownerView?.scrollY ?? ownerRoot.scrollTop;

  // Create highlight element.
  const highlight = ownerDoc.createElement('div');
  highlight.className = 'modal-trigger-highlight';
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;
  highlight.style.top = `${rect.top + scrollY}px`;
  highlight.style.left = `${rect.left + scrollX}px`;
  highlight.style.borderColor = '#007cba';
  highlight.style.backgroundColor = 'rgba(0, 124, 186, 0.1)';
  ownerBody.appendChild(highlight);
  highlightData.highlights.push(highlight);

  // Add tooltip if text is provided.
  if (tooltipText) {
    const tooltip = ownerDoc.createElement('div');
    tooltip.className = 'modal-trigger-tooltip';
    tooltip.textContent = tooltipText;
    tooltip.style.left = `${rect.left + scrollX + rect.width / 2}px`;
    tooltip.style.top = `${rect.top + scrollY}px`;
    tooltip.style.backgroundColor = '#007cba';
    tooltip.style.color = '#ffffff';
    ownerBody.appendChild(tooltip);
    highlightData.tooltips.push(tooltip);
  }

  // Add pulse effect if requested.
  if (showPulse) {
    const pulse = ownerDoc.createElement('div');
    pulse.className = 'modal-trigger-pulse';
    pulse.style.width = `${rect.width}px`;
    pulse.style.height = `${rect.height}px`;
    pulse.style.top = `${rect.top + scrollY}px`;
    pulse.style.left = `${rect.left + scrollX}px`;
    pulse.style.borderColor = '#007cba';
    pulse.style.boxShadow = '0 0 15px rgba(0, 124, 186, 0.7)';
    ownerBody.appendChild(pulse);
    highlightData.pulseElements.push(pulse);
  }

  const updateOverlayPositions = (): void => {
    if (!triggerElement || !ownerDocumentContains(triggerElement)) {
      return;
    }

    const newRect = triggerElement.getBoundingClientRect();
    const newScrollX = ownerView?.scrollX ?? ownerRoot.scrollLeft;
    const newScrollY = ownerView?.scrollY ?? ownerRoot.scrollTop;

    highlightData.highlights.forEach(el => {
      el.style.width = `${newRect.width}px`;
      el.style.height = `${newRect.height}px`;
      el.style.top = `${newRect.top + newScrollY}px`;
      el.style.left = `${newRect.left + newScrollX}px`;
    });

    highlightData.pulseElements.forEach(el => {
      el.style.width = `${newRect.width}px`;
      el.style.height = `${newRect.height}px`;
      el.style.top = `${newRect.top + newScrollY}px`;
      el.style.left = `${newRect.left + newScrollX}px`;
    });

    highlightData.tooltips.forEach(el => {
      el.style.left = `${newRect.left + newScrollX + newRect.width / 2}px`;
      el.style.top = `${newRect.top + newScrollY}px`;
    });
  };

  // ResizeObserver is a browser global — prefer the canvas view's ctor when present.
  type WindowWithResizeObserver = Window & {
    ResizeObserver?: typeof ResizeObserver;
  };
  const ResizeObserverCtor =
    (ownerView as WindowWithResizeObserver | null)?.ResizeObserver ??
    (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);

  if (ResizeObserverCtor) {
    const resizeObserver = new ResizeObserverCtor(updateOverlayPositions);
    resizeObserver.observe(ownerBody);
    highlightData.resizeObserver = resizeObserver;
  }

  // Scroll listener on the canvas window so tablet/mobile preview resizes track correctly.
  if (ownerView) {
    ownerView.addEventListener('scroll', updateOverlayPositions, {
      passive: true,
    });
    highlightData.eventListeners.push({
      element: ownerView,
      eventType: 'scroll',
      callback: updateOverlayPositions,
    });
  }

  // Auto cleanup after a delay.
  const timer = setTimeout(() => {
    cleanupAllHighlights();
  }, 10000); // 10 seconds.

  highlightData.timers.push(timer);
};

/**
 * Refreshes the highlight on the modal trigger
 *
 * @param triggerBlockId - Block ID containing the trigger
 * @param modalId        - ID of the modal being triggered
 */
export const refreshHighlight = (
  triggerBlockId: string,
  modalId: string
): void => {
  highlightTriggerBlock(triggerBlockId, modalId, true, 'Modal Trigger');
};

/**
 * Creates a direct highlight on the element itself using CSS classes
 *
 * @param targetElement - Element to highlight
 * @param modalId       - Modal ID for reference
 * @return Information about the highlight for cleanup
 */
export const createDirectHighlight = (
  targetElement: HTMLElement,
  _modalId: string
): HighlightInfo | null => {
  if (!targetElement) {
    Debug.add('Cannot create direct highlight - no target element', true);
    return null;
  }

  // Clean up any existing highlights first to avoid multiples.
  cleanupAllHighlights();

  // Style tags must live in the same document as the target (canvas head when iframed).
  const ownerDoc = targetElement.ownerDocument;
  const ownerView = getOwnerView(targetElement);

  Debug.add('Creating direct highlight on element');

  try {
    const styles = DIRECT_STYLE_PROPERTIES.map(name => ({
      name,
      value: targetElement.style.getPropertyValue(name),
      priority: targetElement.style.getPropertyPriority(name),
    }));
    directHighlights.set(targetElement, {
      styles,
      hadHighlightClass: targetElement.classList.contains(
        'modal-highlight-target'
      ),
    });
    targetElement.classList.add('modal-highlight-target');

    // Apply blue highlight styles directly with !important to override any existing styles.
    targetElement.style.setProperty(
      'outline',
      '3px solid #007cba',
      'important'
    );
    targetElement.style.setProperty('outline-offset', '3px', 'important');
    targetElement.style.setProperty(
      'box-shadow',
      '0 0 15px rgba(0, 124, 186, 0.7)',
      'important'
    );
    targetElement.style.setProperty('position', 'relative', 'important');
    targetElement.style.setProperty('z-index', '1000', 'important');

    // Saved IDs must never become stylesheet source.
    const styleTagId = `modal-direct-highlight-style-${++highlightSequence}`;
    const styleTag = ownerDoc.createElement('style');
    styleTag.id = styleTagId;
    styleTag.textContent = `
			@keyframes aa-modal-highlight-pulse {
				0% { outline-color: #007cba !important; box-shadow: 0 0 15px rgba(0, 124, 186, 0.7) !important; }
				50% { outline-color: #4ca8d8 !important; box-shadow: 0 0 25px rgba(0, 124, 186, 0.9) !important; }
				100% { outline-color: #007cba !important; box-shadow: 0 0 15px rgba(0, 124, 186, 0.7) !important; }
			}

			.modal-highlight-target {
				position: relative !important;
				z-index: 1000 !important;
				animation: aa-modal-highlight-pulse 1.5s infinite !important;
				outline: 3px solid #007cba !important;
				outline-offset: 3px !important;
				box-shadow: 0 0 15px rgba(0, 124, 186, 0.7) !important;
			}
			@media (prefers-reduced-motion: reduce) {
				.modal-highlight-target { animation: none !important; }
			}
		`;

    ownerDoc.head.appendChild(styleTag);
    styleElements.add(styleTag);

    // Scroll the element into view within the canvas viewport.
    const scrollTimer = setTimeout(() => {
      const rect = targetElement.getBoundingClientRect();
      const viewportHeight =
        ownerView?.innerHeight ?? ownerDoc.documentElement.clientHeight;
      const viewportWidth =
        ownerView?.innerWidth ?? ownerDoc.documentElement.clientWidth;
      const isInView =
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= viewportHeight &&
        rect.right <= viewportWidth;

      if (!isInView) {
        targetElement.scrollIntoView({
          behavior: ownerView?.matchMedia?.('(prefers-reduced-motion: reduce)')
            .matches
            ? 'instant'
            : 'smooth',
          block: 'center',
        });
        Debug.add('Scrolled element into view');
      } else {
        Debug.add('Element already in view, no scrolling needed');
      }
    }, 50);

    highlightData.timers.push(scrollTimer);

    Debug.add('Direct blue highlight applied successfully');

    // Return highlight info for cleanup and reference.
    return {
      targetElement,
      styleTag,
    };
  } catch (error) {
    cleanupAllHighlights();
    Debug.add(
      `Error in createDirectHighlight: ${(error as Error).message}`,
      true
    );
    return null;
  }
};
