/**
 * Ticker block — editor InspectorControl option lists.
 *
 * Values must stay in sync with `constants.ts` allowlists and `render.php`.
 *
 * @package Aggressive_Blocks
 */

import { __ } from '@wordpress/i18n';

export const LABEL_TYPE_OPTIONS = [
  { label: __('Text', 'aggressive-blocks'), value: 'text' },
  { label: __('Icon', 'aggressive-blocks'), value: 'icon' },
];

export const INDICATOR_SHAPE_OPTIONS = [
  { label: __('Square', 'aggressive-blocks'), value: 'square' },
  { label: __('Circle', 'aggressive-blocks'), value: 'circle' },
  { label: __('Diamond', 'aggressive-blocks'), value: 'diamond' },
  { label: __('None', 'aggressive-blocks'), value: 'none' },
];

export const BLEND_MODE_OPTIONS = [
  { label: __('Normal', 'aggressive-blocks'), value: 'normal' },
  { label: __('Overlay', 'aggressive-blocks'), value: 'overlay' },
  { label: __('Multiply', 'aggressive-blocks'), value: 'multiply' },
  { label: __('Screen', 'aggressive-blocks'), value: 'screen' },
  { label: __('Soft Light', 'aggressive-blocks'), value: 'soft-light' },
  { label: __('Difference', 'aggressive-blocks'), value: 'difference' },
];

export const FONT_WEIGHT_OPTIONS = [
  { label: __('Inherit', 'aggressive-blocks'), value: '' },
  { label: __('400 — Normal', 'aggressive-blocks'), value: '400' },
  { label: __('500 — Medium', 'aggressive-blocks'), value: '500' },
  { label: __('600 — SemiBold', 'aggressive-blocks'), value: '600' },
  { label: __('700 — Bold', 'aggressive-blocks'), value: '700' },
  { label: __('800 — ExtraBold', 'aggressive-blocks'), value: '800' },
  { label: __('900 — Black', 'aggressive-blocks'), value: '900' },
];

export const TEXT_TRANSFORM_OPTIONS = [
  { label: __('None', 'aggressive-blocks'), value: '' },
  { label: __('Uppercase', 'aggressive-blocks'), value: 'uppercase' },
  { label: __('Lowercase', 'aggressive-blocks'), value: 'lowercase' },
  { label: __('Capitalize', 'aggressive-blocks'), value: 'capitalize' },
];

export const PATTERN_OPTIONS = [
  { label: __('None', 'aggressive-blocks'), value: 'none' },
  { label: __('Diagonal Stripes', 'aggressive-blocks'), value: 'diagonal' },
  { label: __('Crosshatch', 'aggressive-blocks'), value: 'crosshatch' },
  { label: __('Dots', 'aggressive-blocks'), value: 'dots' },
  { label: __('Halftone', 'aggressive-blocks'), value: 'halftone' },
  { label: __('Noise', 'aggressive-blocks'), value: 'noise' },
  { label: __('Grain', 'aggressive-blocks'), value: 'grain' },
  { label: __('Scratch', 'aggressive-blocks'), value: 'scratch' },
  { label: __('Grunge', 'aggressive-blocks'), value: 'grunge' },
  { label: __('Herringbone', 'aggressive-blocks'), value: 'herringbone' },
  { label: __('Carbon', 'aggressive-blocks'), value: 'carbon' },
  { label: __('Honeycomb', 'aggressive-blocks'), value: 'honeycomb' },
  { label: __('Linen', 'aggressive-blocks'), value: 'linen' },
];

export const INNER_BLOCKS_TEMPLATE: Array<[string, Record<string, unknown>]> = [
  [
    'core/paragraph',
    {
      placeholder: __('Add ticker content…', 'aggressive-blocks'),
    },
  ],
];
