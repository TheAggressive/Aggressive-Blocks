/**
 * Modal block — editor DOM lookups.
 *
 * Block DOM may live in the admin document or in an iframed editor canvas
 * (post editor, site editor). These helpers search every reachable editor
 * document, resolve a block's element and its trigger, and read block info
 * from the block-editor store. Highlight effects live in highlights.ts.
 */

import { store as blockEditorStore } from '@wordpress/block-editor';
import { select } from '@wordpress/data';

import { Debug } from './utils/debug';

/**
 * Selectors for editor canvas iframes (post editor + site editor).
 * Scripts run in the admin document; block DOM may live in these frames.
 */
const EDITOR_IFRAME_SELECTORS = [
  'iframe[name="editor-canvas"]',
  '.edit-site-visual-editor iframe',
  '.edit-site-canvas iframe',
  'iframe.components-sandbox',
] as const;

/**
 * Collect the admin document plus every reachable editor canvas document.
 *
 * @return Documents to search / clean for block DOM.
 */
export const getEditorDocuments = (): Document[] => {
  const docs: Document[] = [document];
  const seen = new Set<Document>([document]);

  for (const selector of EDITOR_IFRAME_SELECTORS) {
    document.querySelectorAll<HTMLIFrameElement>(selector).forEach(iframe => {
      try {
        const iframeDoc = iframe.contentDocument;
        if (iframeDoc && !seen.has(iframeDoc)) {
          seen.add(iframeDoc);
          docs.push(iframeDoc);
        }
      } catch {
        // Inaccessible iframe (rare in same-origin editor canvases).
      }
    });
  }

  return docs;
};

/**
 * Query a selector across the admin document and all editor canvases.
 *
 * @param selector - CSS selector.
 * @return Matching elements from every reachable editor document.
 */
export const queryAllEditorDocuments = <T extends Element = Element>(
  selector: string
): T[] => {
  const results: T[] = [];

  for (const doc of getEditorDocuments()) {
    results.push(...Array.from(doc.querySelectorAll<T>(selector)));
  }

  return results;
};

/**
 * Whether a node is still attached to its owner document.
 *
 * @param node - Node to check.
 * @return True when the node is in its document tree.
 */
export const ownerDocumentContains = (node: Node): boolean => {
  return node.ownerDocument?.contains(node) ?? false;
};

/**
 * Window for a node's owner document (canvas or admin).
 *
 * @param node - Node whose view is needed.
 * @return The document's defaultView, or null.
 */
export const getOwnerView = (node: Node): Window | null => {
  return node.ownerDocument?.defaultView ?? null;
};

/**
 * Find a block's DOM element by clientId
 *
 * @param clientId - ClientId to find DOM element for
 * @return DOM element or null if not found
 */
export const findBlockDomElement = (clientId: string): Element | null => {
  if (!clientId) {
    Debug.add('findBlockDomElement: No clientId provided', true);
    return null;
  }

  const isInEditorCanvas = (element: Element): boolean => {
    return !!(
      element.closest('.editor-styles-wrapper') ||
      element.closest('.edit-site-visual-editor') ||
      element.closest('.editor-canvas') ||
      element.closest('.edit-post-visual-editor') ||
      // Iframed canvas body has no admin chrome classes — treat any hit
      // inside a non-admin document as in-canvas.
      element.ownerDocument !== document
    );
  };

  const alternativeSelectors = [
    `[data-block="${clientId}"]`,
    `[id="${clientId}"]`,
    `[data-id="${clientId}"]`,
    `[data-block-id="${clientId}"]`,
  ];

  // Search admin document + every editor canvas document.
  for (const doc of getEditorDocuments()) {
    for (const selector of alternativeSelectors) {
      const blockElement = doc.querySelector(selector);
      if (blockElement && isInEditorCanvas(blockElement)) {
        if (doc !== document) {
          Debug.add(`Found block ${clientId} in editor canvas document`);
        }
        return blockElement;
      }
    }
  }

  // Final fallback - custom linkage attributes across all documents.
  Debug.add(`Fallback: looking for link or button with ${clientId}`);
  const linkageMatches = queryAllEditorDocuments(
    `[data-wp-block-linkage="${clientId}"], [data-block-linkage="${clientId}"]`
  );

  if (linkageMatches.length > 0) {
    Debug.add(`Found block using linkage attribute: ${clientId}`);
    return linkageMatches[0];
  }

  // Try accessing the WordPress data store to get block info.
  try {
    const blockEditor = select(blockEditorStore);
    if (blockEditor) {
      const blockInfo = blockEditor.getBlock(clientId);
      if (blockInfo) {
        Debug.add(
          `Block exists in store but can't find DOM element: ${clientId}`
        );
        Debug.add(
          `Block type: ${blockInfo.name}, is valid: ${blockEditor.isBlockValid(clientId)}`
        );
      }
    }
  } catch (error) {
    Debug.add(`Error accessing block store: ${(error as Error).message}`, true);
  }

  Debug.add(`Could not find DOM element for block: ${clientId}`, true);
  return null;
};

/**
 * Finds a trigger element within a block
 *
 * @param blockElement - The block element to search within
 * @param modalId      - The modal ID to find triggers for
 * @return The trigger element or null if not found
 */
export const findTriggerElement = (
  blockElement: Element | null,
  modalId: string
): Element | null => {
  if (!blockElement) {
    return null;
  }

  // Look for elements with the modal-trigger-{modalId} class.
  const triggerClass = `modal-trigger-${modalId}`;
  const directElement = blockElement.querySelector(`.${triggerClass}`);

  if (directElement) {
    return directElement;
  }

  // Check if the block element itself has the class.
  if (blockElement.classList.contains(triggerClass)) {
    return blockElement;
  }

  // Special case for buttons, links, and other possible triggers.
  const potentialTriggers = [
    ...blockElement.querySelectorAll(
      'a, button, .wp-block-button__link, [role="button"]'
    ),
  ];

  if (potentialTriggers.length === 1) {
    return potentialTriggers[0];
  }

  return null;
};
