/**
 * Shared Interactivity helpers used by migrated blocks.
 *
 * Extracted from the theme helper module. Only the focus-trap used by Modal
 * is owned here; product-grid and store helpers stay in Aggressive Apparel.
 *
 * @package Aggressive_Blocks
 */

export function setupFocusTrap(container: HTMLElement): () => void {
  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const handleKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') {
      return;
    }

    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter(el => !el.closest('[hidden]') && !el.closest('[inert]'));

    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const currentIndex = focusable.indexOf(
      document.activeElement as HTMLElement
    );
    let nextIndex: number;

    if (e.shiftKey) {
      nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
    } else {
      nextIndex = currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1;
    }

    e.preventDefault();
    focusable[nextIndex].focus();
  };

  container.addEventListener('keydown', handleKeydown);

  return () => {
    container.removeEventListener('keydown', handleKeydown);
  };
}
