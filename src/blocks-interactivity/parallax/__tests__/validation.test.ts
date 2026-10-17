import { applyParallaxDefaults } from '../config';
import { PARALLAX_EFFECT_DEFAULTS } from '../utils/effects-editor';
import { sanitizeParallaxEffects, validateConfiguration } from '../validation';

describe('saved parallax effect validation', () => {
  it.each([NaN, Infinity, -Infinity, null, '5'])(
    'discards invalid blur %p',
    startBlur => {
      const result = sanitizeParallaxEffects({
        blur: { enabled: true, startBlur, endBlur: 0, fadeRange: 'full' },
      });
      expect(result.effects).toEqual({});
      expect(result.errors).toEqual(['Ignoring invalid blur effect']);
    }
  );

  it.each([
    { speed: Infinity },
    { speed: NaN },
    { speed: -1 },
    { mode: 'invalid' },
    { axis: 'toString' },
    { startRotation: NaN },
    { effectStart: NaN },
    { effectEnd: null },
    { effectStart: 0.8, effectEnd: 0.2 },
    { effectMode: 'invalid' },
  ])('discards invalid rotation settings %p', patch => {
    const { effects, errors } = sanitizeParallaxEffects({
      rotation: {
        enabled: true,
        ...PARALLAX_EFFECT_DEFAULTS.rotation,
        ...patch,
      },
    });
    expect(effects.rotation).toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it.each([
    'transparent',
    'red',
    '#abcd',
    '#11223344',
    'rgb(20 30 40 / 50%)',
    'hsl(200 50% 40%)',
  ])('accepts renderer-supported color %s', startColor => {
    const colorTransition = {
      enabled: true,
      startColor,
      endColor: '#fff',
      transitionType: 'background',
    };
    expect(sanitizeParallaxEffects({ colorTransition })).toEqual({
      effects: { colorTransition },
      errors: [],
    });
  });

  it.each([null, [], 42, 'effects'])(
    'rejects a non-object effect map %p',
    value => {
      expect(sanitizeParallaxEffects(value).effects).toEqual({});
      expect(sanitizeParallaxEffects(value).errors).toHaveLength(1);
    }
  );

  it('accepts all editor defaults without requiring unused optional fields', () => {
    for (const [key, defaults] of Object.entries(PARALLAX_EFFECT_DEFAULTS)) {
      const effect = { enabled: true, ...defaults };
      expect(sanitizeParallaxEffects({ [key]: effect })).toEqual({
        effects: { [key]: effect },
        errors: [],
      });
    }
  });

  it('ignores disabled effects without reporting errors', () => {
    expect(sanitizeParallaxEffects({ blur: { enabled: false } })).toEqual({
      effects: {},
      errors: [],
    });
  });

  it('discards malformed payloads and keeps valid sibling effects', () => {
    const rotation = { enabled: true, ...PARALLAX_EFFECT_DEFAULTS.rotation };
    const result = sanitizeParallaxEffects({
      blur: null,
      colorTransition: { enabled: true, startColor: 42 },
      dynamicShadow: { enabled: true, startShadow: 12, endShadow: [] },
      scrollOpacity: { enabled: true, startOpacity: null, endOpacity: 1 },
      magneticMouse: { enabled: true, strength: '2', range: null },
      zoom: { enabled: 'true', intensity: 1 },
      zIndex: { value: Infinity },
      depthLevel: { value: '1' },
      rotation,
    });
    expect(result.effects).toEqual({ rotation });
    expect(result.errors).toHaveLength(8);
  });

  it('allows CSS shadow units and layers without a restrictive shadow regex', () => {
    const dynamicShadow = {
      enabled: true,
      shadowType: 'box-shadow',
      startShadow: 'none',
      endShadow: '0 0 1rem red, 1px 2px 3px blue',
    };
    expect(sanitizeParallaxEffects({ dynamicShadow }).errors).toEqual([]);
  });
});

describe('container configuration validation', () => {
  it('accepts defaults and empty boundary sides', () => {
    expect(validateConfiguration(applyParallaxDefaults({}))).toEqual([]);
    expect(
      validateConfiguration(
        applyParallaxDefaults({
          detectionBoundary: { top: '', right: '', bottom: '', left: '' },
        })
      )
    ).toEqual([]);
  });

  it.each([
    { intensity: NaN },
    { visibilityTrigger: Infinity },
    { perspectiveDistance: 0 },
    { maxMouseTranslation: Infinity },
    { transitionDuration: NaN },
    { activationBuffer: -1 },
    {
      detectionBoundary: {
        top: 'invalid',
        right: '0%',
        bottom: '0%',
        left: '0%',
      },
    },
  ])('rejects invalid container settings %p', patch => {
    expect(validateConfiguration(applyParallaxDefaults(patch))).not.toEqual([]);
  });
});
