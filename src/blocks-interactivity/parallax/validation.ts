/** Validate saved parallax settings before they reach either renderer. */

import { parseColor } from './calculations';
import type { ParallaxContext, ParallaxEffects } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const oneOf = (value: unknown, choices: readonly string[]): boolean =>
  typeof value === 'string' && choices.includes(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function validateConfiguration(config: ParallaxContext): string[] {
  const errors: string[] = [];
  if (!inRange(config.intensity, 0, 200)) errors.push('Invalid intensity');
  if (!inRange(config.visibilityTrigger, 0, 1)) {
    errors.push('Invalid visibility trigger');
  }
  const boundary = config.detectionBoundary;
  if (
    !isRecord(boundary) ||
    !['top', 'right', 'bottom', 'left'].every(
      key =>
        typeof boundary[key] === 'string' &&
        (boundary[key] === '' ||
          (/^-?(?:\d+\.?\d*|\.\d+)(?:px|%)$/.test(boundary[key]) &&
            Number.isFinite(parseFloat(boundary[key]))))
    )
  ) {
    errors.push('Invalid detection boundary');
  }
  for (const key of [
    'enableMouseInteraction',
    'disableOnMobile',
    'debugMode',
    'depthOfField',
  ] as const) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean') {
      errors.push(`Invalid ${key}`);
    }
  }
  for (const key of [
    'activationBuffer',
    'mouseInfluenceMultiplier',
    'maxMouseTranslation',
    'depthIntensityMultiplier',
    'transitionDuration',
    'maxMouseRotation',
  ] as const) {
    if (
      config[key] !== undefined &&
      !inRange(config[key], 0, Number.MAX_VALUE)
    ) {
      errors.push(`Invalid ${key}`);
    }
  }
  if (
    config.perspectiveDistance !== undefined &&
    !inRange(config.perspectiveDistance, Number.MIN_VALUE, Number.MAX_VALUE)
  ) {
    errors.push('Invalid perspective distance');
  }
  if (
    config.parallaxDirection !== undefined &&
    !oneOf(config.parallaxDirection, ['up', 'down', 'both'])
  ) {
    errors.push('Invalid parallax direction');
  }
  return errors;
}

const validTiming = (effect: Record<string, unknown>): boolean => {
  const { effectStart, effectEnd, effectMode } = effect;
  const start = effectStart === undefined ? 0 : effectStart;
  const end = effectEnd === undefined ? 0.25 : effectEnd;
  return (
    inRange(start, 0, 1) &&
    inRange(end, 0, 1) &&
    (effectMode === undefined ||
      oneOf(effectMode, ['sustain', 'peek', 'reverse'])) &&
    // The renderers default to a 0..0.25 interval.
    end > start
  );
};

const validColor = (value: unknown): boolean =>
  typeof value === 'string' && parseColor(value) !== null;

function validEffect(key: string, effect: Record<string, unknown>): boolean {
  switch (key) {
    case 'depthLevel':
      return inRange(effect.value, 0.1, 3);
    case 'zIndex':
      return (
        typeof effect.value === 'number' && Number.isSafeInteger(effect.value)
      );
    case 'zoom':
      return (
        oneOf(effect.type, ['in', 'out']) && inRange(effect.intensity, 0, 1)
      );
    case 'magneticMouse':
      return (
        inRange(effect.strength, 0, 100) &&
        inRange(effect.range, 0, Number.MAX_VALUE) &&
        oneOf(effect.mode, ['attract', 'repel'])
      );
    case 'velocityBlur':
      return (
        (effect.maxBlur === undefined || inRange(effect.maxBlur, 0, 50)) &&
        (effect.sensitivity === undefined ||
          inRange(effect.sensitivity, 0, Number.MAX_VALUE)) &&
        (effect.direction === undefined ||
          oneOf(effect.direction, ['vertical', 'horizontal']))
      );
    case 'scrollOpacity':
      return (
        validTiming(effect) &&
        inRange(effect.startOpacity, 0, 1) &&
        inRange(effect.endOpacity, 0, 1) &&
        oneOf(effect.fadeRange, ['top', 'middle', 'bottom', 'full'])
      );
    case 'blur':
      return (
        validTiming(effect) &&
        inRange(effect.startBlur, 0, 50) &&
        inRange(effect.endBlur, 0, 50) &&
        (effect.fadeRange === undefined ||
          oneOf(effect.fadeRange, ['top', 'middle', 'bottom', 'full']))
      );
    case 'colorTransition':
      return (
        validTiming(effect) &&
        validColor(effect.startColor) &&
        validColor(effect.endColor) &&
        oneOf(effect.transitionType, ['background', 'text', 'border'])
      );
    case 'dynamicShadow':
      // CSS remains responsible for parsing shadow syntax; interpolation
      // only requires strings. Avoid rejecting valid units or layered shadows.
      return (
        validTiming(effect) &&
        nonEmptyString(effect.startShadow) &&
        nonEmptyString(effect.endShadow) &&
        oneOf(effect.shadowType, ['box-shadow', 'text-shadow', 'drop-shadow'])
      );
    case 'rotation':
      return (
        validTiming(effect) &&
        inRange(effect.startRotation, -360, 360) &&
        inRange(effect.endRotation, -360, 360) &&
        (effect.axis === undefined ||
          oneOf(effect.axis, ['x', 'y', 'z', 'all'])) &&
        (effect.speed === undefined || inRange(effect.speed, 0.1, 3)) &&
        (effect.mode === undefined ||
          oneOf(effect.mode, ['range', 'continuous', 'looping']))
      );
    default:
      return false;
  }
}

/** Keep valid effects independently; never pass malformed saved values on. */
export function sanitizeParallaxEffects(value: unknown): {
  effects: ParallaxEffects;
  errors: string[];
} {
  const effects: ParallaxEffects = {};
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { effects, errors: ['Effects must be an object'] };
  }
  for (const key of Object.keys(value)) {
    const effect = value[key];
    if (isRecord(effect) && effect.enabled === false) continue;
    if (
      isRecord(effect) &&
      (key === 'depthLevel' || key === 'zIndex' || effect.enabled === true) &&
      validEffect(key, effect)
    ) {
      Object.assign(effects, { [key]: effect });
    } else {
      errors.push(`Ignoring invalid ${key} effect`);
    }
  }
  return { effects, errors };
}
