/** Keyboard ownership guards shared by carousel and scroll navigation. */

/** Controls and elements that own their own Space/Enter activation. */
const ACTIVATABLE_SELECTOR = [
  'a[href]',
  'button',
  'summary',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
].join(',');

/** Composite widgets that use arrow / Home / End keys themselves. */
const KEYBOARD_WIDGET_SELECTOR = [
  'select',
  'video',
  'audio',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="scrollbar"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="radiogroup"]',
  '[role="radio"]',
  '[role="tablist"]',
  '[role="tab"]',
  '[role="tree"]',
  '[role="treeitem"]',
  '[role="grid"]',
  '[role="treegrid"]',
].join(',');

/**
 * Whether a paging keydown must be left alone. Both carousels and galleries
 * must preserve keys that belong to something else:
 *
 * - browser and OS shortcuts (Alt+Arrow is Back/Forward, Ctrl/Cmd+Home, …);
 * - Shift+Arrow text selection (Shift+Space stays: it pages back);
 * - IME composition and keys another handler already consumed;
 * - text entry and composite widgets that use arrows themselves;
 * - Space on anything it activates (buttons, links, summaries, …);
 * - anything inside a modal dialog the gallery is not part of.
 */
export function shouldIgnoreKeyboardEvent(
  event: Pick<
    KeyboardEvent,
    | 'key'
    | 'altKey'
    | 'ctrlKey'
    | 'metaKey'
    | 'shiftKey'
    | 'defaultPrevented'
    | 'isComposing'
    | 'target'
  >,
  scope?: Element | null
): boolean {
  if (event.defaultPrevented || event.isComposing) return true;
  if (event.altKey || event.ctrlKey || event.metaKey) return true;

  const isSpace = event.key === ' ' || event.key === 'Spacebar';
  if (event.shiftKey && !isSpace) return true;

  const target = event.target;
  if (!(target instanceof Element)) return false;

  if (isEditableTarget(target)) return true;
  if (target.closest(KEYBOARD_WIDGET_SELECTOR)) return true;
  if (isSpace && target.closest(ACTIVATABLE_SELECTOR)) return true;

  const dialog = target.closest('dialog, [aria-modal="true"]');
  if (dialog && !(scope && dialog.contains(scope))) return true;

  return false;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'select' ||
    tagName === 'textarea'
  );
}
