/**
 * Hero Carousel — background motion variants.
 *
 * Shared by the carousel inspector and per-slide Cover overrides so the
 * option lists stay in sync. Variant slugs live in `motion-variants.json`
 * (also loaded by render.php).
 *
 * @package Aggressive_Blocks
 */

import { __ } from '@wordpress/i18n';

import variants from './motion-variants.json';

/**
 * Concrete per-slide motion classes (excludes carousel meta modes).
 * JSON imports as `string[]`; assert through `unknown` to the tuple shape
 * that matches `motion-variants.json` (kept in sync with render.php).
 */
export const HERO_MOTION_VARIANTS = variants as unknown as readonly [
  'zoom-in',
  'zoom-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'diagonal',
  'zoom-pan',
  'punch-in',
  'pull-back',
  'breathe',
  'idle-sway',
  'blur-sharp',
  'brightness',
  'colorize',
  'clip-reveal',
  'slide-in',
  'scale-edge',
  'tilt',
  'orbit',
  'grain',
];

export type HeroMotionVariant = (typeof HERO_MOTION_VARIANTS)[number];

/** Carousel-level attribute values (variants + assignment modes). */
export type HeroMotionMode =
  'none' | HeroMotionVariant | 'alternate' | 'random';

const VARIANT_LABELS: Record<HeroMotionVariant, string> = {
  'zoom-in': __('Zoom in', 'aggressive-blocks'),
  'zoom-out': __('Zoom out', 'aggressive-blocks'),
  'pan-left': __('Pan left', 'aggressive-blocks'),
  'pan-right': __('Pan right', 'aggressive-blocks'),
  'pan-up': __('Pan up', 'aggressive-blocks'),
  'pan-down': __('Pan down', 'aggressive-blocks'),
  diagonal: __('Diagonal drift', 'aggressive-blocks'),
  'zoom-pan': __('Zoom + pan', 'aggressive-blocks'),
  'punch-in': __('Punch in', 'aggressive-blocks'),
  'pull-back': __('Pull back', 'aggressive-blocks'),
  breathe: __('Breathing', 'aggressive-blocks'),
  'idle-sway': __('Idle sway', 'aggressive-blocks'),
  'blur-sharp': __('Blur to sharp', 'aggressive-blocks'),
  brightness: __('Brightness lift', 'aggressive-blocks'),
  colorize: __('Colorize', 'aggressive-blocks'),
  'clip-reveal': __('Clip reveal', 'aggressive-blocks'),
  'slide-in': __('Slide in', 'aggressive-blocks'),
  'scale-edge': __('Scale from edge', 'aggressive-blocks'),
  tilt: __('Tilt zoom', 'aggressive-blocks'),
  orbit: __('Orbit drift', 'aggressive-blocks'),
  grain: __('Film grain drift', 'aggressive-blocks'),
};

/** Carousel inspector options (includes alternate / random). */
export const HERO_MOTION_MODES: Array<{
  label: string;
  value: HeroMotionMode;
}> = [
  { label: __('None', 'aggressive-blocks'), value: 'none' },
  ...HERO_MOTION_VARIANTS.map(value => ({
    label: VARIANT_LABELS[value],
    value,
  })),
  {
    label: __('Alternate per slide', 'aggressive-blocks'),
    value: 'alternate',
  },
  {
    label: __('Random per slide', 'aggressive-blocks'),
    value: 'random',
  },
];

/** Per-slide Cover override options (inherit + none + concrete variants). */
export const HERO_MOTION_OVERRIDE_OPTIONS: Array<{
  label: string;
  value: string;
}> = [
  {
    label: __('Inherit from carousel', 'aggressive-blocks'),
    value: '',
  },
  { label: __('None', 'aggressive-blocks'), value: 'none' },
  ...HERO_MOTION_VARIANTS.map(value => ({
    label: VARIANT_LABELS[value],
    value,
  })),
];
