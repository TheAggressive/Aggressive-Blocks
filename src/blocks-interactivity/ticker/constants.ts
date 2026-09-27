/**
 * Ticker block — shared selectors, limits, and allowlists.
 *
 * @package Aggressive_Blocks
 */

/** Marks `.ticker__content` copies created at runtime (vs server-rendered). */
export const CLONE_ATTR = 'data-ticker-clone';

/**
 * Ceiling on runtime clones per ticker. Degenerate content (a few px wide
 * on a wide viewport) could otherwise demand thousands of copies and bloat
 * the DOM.
 */
export const MAX_TICKER_CLONES = 100;

/**
 * localStorage key for a visitor's manual pause. One site-wide preference:
 * a visitor who stops one marquee doesn't want the next page's moving either.
 */
export const PAUSE_STORAGE_KEY = 'aggressive-blocks:ticker-paused';

/** Document event that keeps every ticker on the page on the same pause. */
export const PAUSE_EVENT = 'aggressive-blocks:ticker-pause';

/** Default scroll speed in px/s when `data-ticker-speed` is missing. */
export const DEFAULT_TICKER_SPEED = 60;

/**
 * How long the marquee takes to glide from full speed to a stop, or back up,
 * when paused, held, or resumed.
 */
export const TICKER_MOTION_EASE_MS = 400;

/**
 * CSS custom property for the pause/play control color.
 * Synced from `.ticker__content` so adaptive content colors win over the
 * wrapper's `has-*-color` class (e.g. white wrapper + surface-elevated copy).
 */
export const CONTROL_COLOR_VAR = '--ticker-control-color';

export const SELECTORS = {
  scroll: '.ticker__scroll',
  track: '.ticker__track',
  content: '.ticker__content',
} as const;

/** Allowed marquee directions (must match block.json / editor options). */
export const TICKER_DIRECTIONS = ['left', 'right'] as const;

/** Allowed label indicator shapes. */
export const INDICATOR_SHAPES = [
  'square',
  'circle',
  'diamond',
  'none',
] as const;

/** Allowed background pattern slugs. */
export const PATTERN_SLUGS = [
  'none',
  'diagonal',
  'crosshatch',
  'dots',
  'halftone',
  'noise',
  'grain',
  'scratch',
  'grunge',
  'herringbone',
  'carbon',
  'honeycomb',
  'linen',
] as const;

/** Allowed CSS mix-blend-mode values for the pattern overlay. */
export const PATTERN_BLEND_MODES = [
  'normal',
  'overlay',
  'multiply',
  'screen',
  'soft-light',
  'difference',
] as const;

/** Allowed label types. */
export const LABEL_TYPES = ['text', 'icon'] as const;

/** Allowed label font weights (empty = inherit). */
export const LABEL_FONT_WEIGHTS = [
  '',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
] as const;

/** Allowed label text-transform values (empty = none). */
export const LABEL_TEXT_TRANSFORMS = [
  '',
  'uppercase',
  'lowercase',
  'capitalize',
] as const;

export type TickerDirection = (typeof TICKER_DIRECTIONS)[number];
export type IndicatorShape = (typeof INDICATOR_SHAPES)[number];
export type PatternSlug = (typeof PATTERN_SLUGS)[number];
export type PatternBlendMode = (typeof PATTERN_BLEND_MODES)[number];
export type LabelType = (typeof LABEL_TYPES)[number];
