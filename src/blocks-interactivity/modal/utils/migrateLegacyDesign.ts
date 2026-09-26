/**
 * Move the retired dialog design attributes onto block supports.
 *
 * `dialogPadding` and `dialogBorderRadius` duplicated the Dimensions and
 * Border panels. They styled the dialog while the block-support values only
 * reached a copy of the wrapper saved inside the dialog body, so the legacy
 * values win to keep the dialog looking the same. Margin support is gone: the
 * dialog is fixed to the viewport, so the saved margin is dropped.
 *
 * @module src/blocks-interactivity/modal/utils/migrateLegacyDesign
 */

type Style = Record<string, unknown>;

export interface LegacyDesignAttributes {
  dialogPadding?: string;
  dialogBorderRadius?: string;
  style?: Style;
  [key: string]: unknown;
}

type Side = 'top' | 'right' | 'bottom' | 'left';

/**
 * Split a CSS shorthand on whitespace outside parentheses, so
 * `calc(1rem + 2px) 2rem` yields two values.
 *
 * @param value CSS shorthand value.
 * @return The component values.
 */
function splitShorthand(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of value.trim()) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(char) && depth === 0) {
      if (current) parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);

  return parts;
}

/**
 * Expand a 1–4 value padding shorthand into the per-side object the
 * Dimensions panel stores.
 *
 * @param value CSS padding shorthand.
 * @return Per-side padding, or null when the value is not a 1–4 value shorthand.
 */
export function expandPaddingShorthand(
  value: string
): Record<Side, string> | null {
  const parts = splitShorthand(value);
  if (parts.length < 1 || parts.length > 4) return null;

  const [top, right = top, bottom = top, left = right] = parts;
  return { top, right, bottom, left };
}

/**
 * Migrate v2 (and earlier) attributes to the current shape.
 *
 * @param attributes Attributes parsed with a deprecated definition.
 * @return Attributes for the current block definition.
 */
export function migrateLegacyDesign(
  attributes: LegacyDesignAttributes
): Record<string, unknown> {
  const { dialogPadding, dialogBorderRadius, style, ...rest } = attributes;
  const nextStyle: Style = { ...(style ?? {}) };

  const spacing = { ...((nextStyle.spacing as Style | undefined) ?? {}) };
  delete spacing.margin;

  const padding = dialogPadding ? expandPaddingShorthand(dialogPadding) : null;
  if (padding) spacing.padding = padding;

  if (Object.keys(spacing).length > 0) {
    nextStyle.spacing = spacing;
  } else {
    delete nextStyle.spacing;
  }

  if (dialogBorderRadius?.trim()) {
    nextStyle.border = {
      ...((nextStyle.border as Style | undefined) ?? {}),
      radius: dialogBorderRadius.trim(),
    };
  }

  return Object.keys(nextStyle).length > 0
    ? { ...rest, style: nextStyle }
    : rest;
}
