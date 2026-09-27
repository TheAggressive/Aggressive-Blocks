/**
 * Effect progress mapping modes.
 *
 * @jest-environment jsdom
 */

import {
  calculateBlur,
  calculateColorTransition,
  calculateRotation,
  calculateShadow,
  interpolateShadow,
  mapProgressToEffectRange,
  parseColor,
} from '../calculations';
import { MOBILE_MAX_WIDTH_PX } from '../config';

describe('mapProgressToEffectRange', () => {
  it('returns 0 before the effect window and 1 after in sustain mode', () => {
    expect(mapProgressToEffectRange(0.1, 0.2, 0.7, 'sustain')).toBe(0);
    expect(mapProgressToEffectRange(0.8, 0.2, 0.7, 'sustain')).toBe(1);
  });

  it('interpolates linearly inside the sustain window', () => {
    expect(mapProgressToEffectRange(0.45, 0.2, 0.7, 'sustain')).toBeCloseTo(
      0.5
    );
  });

  it('peaks mid-window for peek and reverse, then falls', () => {
    const mid = mapProgressToEffectRange(0.5, 0, 1, 'peek');
    const late = mapProgressToEffectRange(0.9, 0, 1, 'peek');
    expect(mid).toBeCloseTo(1, 1);
    expect(late).toBeLessThan(mid);

    expect(mapProgressToEffectRange(1, 0, 1, 'reverse')).toBe(0);
    expect(mapProgressToEffectRange(0.5, 0, 1, 'reverse')).toBeCloseTo(1, 1);
  });

  it('falls back to raw progress when the range is invalid', () => {
    expect(mapProgressToEffectRange(0.4, 0.8, 0.2, 'sustain')).toBe(0.4);
  });
});

describe('MOBILE_MAX_WIDTH_PX', () => {
  it('stays aligned with the CSS mobile gate (768)', () => {
    expect(MOBILE_MAX_WIDTH_PX).toBe(768);
  });
});

describe('calculateColorTransition', () => {
  it('interpolates hex colors in sustain mode', () => {
    expect(calculateColorTransition(0.5, '#000000', '#ffffff')).toBe(
      'rgb(128, 128, 128)'
    );
    expect(calculateColorTransition(1, '#000', '#fff')).toBe(
      'rgb(255, 255, 255)'
    );
  });

  it('carries alpha through rgba, 8-digit hex and modern syntax', () => {
    // Regression: the rgb() pattern never matched "rgba(", so any
    // transparent color silently fell back to a static value.
    expect(
      calculateColorTransition(0.5, 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 1)')
    ).toBe('rgba(0, 0, 0, 0.5)');
    expect(calculateColorTransition(0, '#ff000080', '#ff0000')).toBe(
      'rgba(255, 0, 0, 0.502)'
    );
    expect(calculateColorTransition(0, 'rgb(10 20 30 / 25%)', 'red')).toBe(
      'rgba(10, 20, 30, 0.25)'
    );
  });

  it('parses named, hsl and transparent colors', () => {
    expect(parseColor('RebeccaPurple')).toEqual({
      r: 102,
      g: 51,
      b: 153,
      a: 1,
    });
    expect(parseColor('hsl(120, 100%, 25%)')).toEqual({
      r: 0,
      g: 128,
      b: 0,
      a: 1,
    });
    expect(parseColor('hsla(0 100% 50% / 0.5)')?.a).toBe(0.5);
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('rejects junk without throwing and falls back to the valid side', () => {
    expect(parseColor('var(--x)')).toBeNull();
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('rgb(1, 2)')).toBeNull();
    expect(parseColor('constructor')).toBeNull();
    expect(calculateColorTransition(0.5, 'nope', '#ffffff')).toBe(
      'rgb(255, 255, 255)'
    );
    expect(calculateColorTransition(0.5, 'nope', 'nada')).toBe('#000000');
  });
});

describe('calculateShadow', () => {
  const start = '0px 0px 0px rgba(0,0,0,0)';
  const end = '10px 10px 20px rgba(0,0,0,0.3)';

  it('blends offsets, blur and color smoothly', () => {
    // Regression: this used to snap from start to end at the midpoint.
    expect(calculateShadow(0.25, start, end)).toBe(
      '2.5px 2.5px 5px rgba(0,0,0,0.075)'
    );
    expect(calculateShadow(0, start, end)).toBe(start);
    expect(calculateShadow(1, start, end)).toBe(
      '10px 10px 20px rgba(0,0,0,0.3)'
    );
  });

  it('switches at the midpoint when the shapes cannot blend', () => {
    expect(interpolateShadow('0 0 4px red', 'inset 0 0 4px blue', 0.4)).toBe(
      '0 0 4px red'
    );
    expect(interpolateShadow('0 0 4px red', 'inset 0 0 4px blue', 0.6)).toBe(
      'inset 0 0 4px blue'
    );
  });
});

describe('calculateRotation', () => {
  it('interpolates within the range', () => {
    expect(calculateRotation(0.5, 0, 90)).toBe(45);
  });

  it('keeps spinning in continuous mode', () => {
    expect(calculateRotation(1, 0, 90, 2, 'continuous')).toBe(720);
  });

  it('wraps in looping mode', () => {
    expect(calculateRotation(1, 10, 370, 1, 'looping')).toBe(10);
  });
});

describe('calculateBlur fade ranges', () => {
  it('peaks mid-scroll for the middle range', () => {
    expect(calculateBlur(0.5, 0, 10, 'middle', 0, 1)).toBe(10);
    expect(calculateBlur(1, 0, 10, 'middle', 0, 1)).toBe(0);
  });

  it('front-loads the top range and back-loads the bottom range', () => {
    expect(calculateBlur(0.5, 0, 10, 'top', 0, 1)).toBe(10);
    expect(calculateBlur(0.5, 0, 10, 'bottom', 0, 1)).toBe(0);
  });
});
