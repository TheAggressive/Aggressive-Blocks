/**
 * Tests for ticker pure helpers.
 *
 * @jest-environment jsdom
 */

import {
  easeTickerMotion,
  getTickerPxPerMs,
  isEffectivelyPaused,
  isTickerPauseControl,
  isTickerReverseDirection,
  parseTickerDataSpeed,
  pickAllowed,
  resolveTickerControlColor,
  shouldAnimateTicker,
  stepTickerMotion,
} from '../logic';
import { PATTERN_SLUGS, TICKER_DIRECTIONS } from '../constants';

describe('parseTickerDataSpeed', () => {
  it('parses loop duration from data-ticker-speed', () => {
    expect(parseTickerDataSpeed('20')).toBe(20);
  });

  it('falls back when the value is missing or invalid', () => {
    expect(parseTickerDataSpeed(undefined)).toBe(30);
    expect(parseTickerDataSpeed('invalid', 45)).toBe(45);
    expect(parseTickerDataSpeed('0')).toBe(30);
    expect(parseTickerDataSpeed('-5')).toBe(30);
  });
});

describe('isTickerReverseDirection', () => {
  it('treats right as reverse scrolling', () => {
    expect(isTickerReverseDirection('right')).toBe(true);
    expect(isTickerReverseDirection('left')).toBe(false);
    expect(isTickerReverseDirection(undefined)).toBe(false);
  });
});

describe('getTickerPxPerMs', () => {
  it('scrolls one content width over the configured duration', () => {
    expect(getTickerPxPerMs(900, 20)).toBeCloseTo(0.045);
  });

  it('returns zero for invalid measurements', () => {
    expect(getTickerPxPerMs(0, 20)).toBe(0);
    expect(getTickerPxPerMs(900, 0)).toBe(0);
    expect(getTickerPxPerMs(-10, 20)).toBe(0);
  });
});

describe('isEffectivelyPaused', () => {
  const running = {
    isPaused: false,
    isHeld: false,
    motionLocked: false,
  };

  it('is false when the marquee is free to run', () => {
    expect(isEffectivelyPaused(running)).toBe(false);
  });

  it.each([
    ['manual pause', { isPaused: true }],
    ['hover/focus hold', { isHeld: true }],
    ['reduced-motion lock', { motionLocked: true }],
  ])('is true for %s', (_label, change) => {
    expect(isEffectivelyPaused({ ...running, ...change })).toBe(true);
  });

  it('keeps manual pause while a hold is cleared', () => {
    expect(
      isEffectivelyPaused({
        isPaused: true,
        isHeld: false,
        motionLocked: false,
      })
    ).toBe(true);
  });
});

describe('shouldAnimateTicker', () => {
  const active = {
    isDestroyed: false,
    isIntersecting: true,
    isDocumentVisible: true,
    reducedMotion: false,
    isPaused: false,
    motion: 1,
    pxPerMs: 1,
  };

  it('runs only when the ticker is visible and active', () => {
    expect(shouldAnimateTicker(active)).toBe(true);
  });

  it.each([
    ['destroyed', { isDestroyed: true }],
    ['offscreen', { isIntersecting: false }],
    ['in a hidden document', { isDocumentVisible: false }],
    ['reduced motion', { reducedMotion: true }],
    ['paused and settled', { isPaused: true, motion: 0 }],
    ['not measured', { pxPerMs: 0 }],
  ])('stops when %s', (_label, change) => {
    expect(shouldAnimateTicker({ ...active, ...change })).toBe(false);
  });

  it('keeps running while a paused ticker glides to a stop', () => {
    expect(
      shouldAnimateTicker({ ...active, isPaused: true, motion: 0.4 })
    ).toBe(true);
  });

  it('runs to ramp a resumed ticker up from a stop', () => {
    expect(shouldAnimateTicker({ ...active, motion: 0 })).toBe(true);
  });
});

describe('stepTickerMotion', () => {
  it('moves toward the target so a full ramp takes the duration', () => {
    expect(stepTickerMotion(0, 1, 100, 400)).toBeCloseTo(0.25);
    expect(stepTickerMotion(1, 0, 100, 400)).toBeCloseTo(0.75);
  });

  it('never overshoots the target', () => {
    expect(stepTickerMotion(0.9, 1, 100, 400)).toBe(1);
    expect(stepTickerMotion(0.1, 0, 100, 400)).toBe(0);
  });

  it('holds on a zero or negative delta', () => {
    expect(stepTickerMotion(0.5, 1, 0, 400)).toBe(0.5);
    expect(stepTickerMotion(0.5, 0, -16, 400)).toBe(0.5);
  });

  it('jumps straight to the target without a duration', () => {
    expect(stepTickerMotion(1, 0, 16, 0)).toBe(0);
  });
});

describe('easeTickerMotion', () => {
  it('maps the ends to stopped and full speed', () => {
    expect(easeTickerMotion(0)).toBe(0);
    expect(easeTickerMotion(1)).toBe(1);
    expect(easeTickerMotion(0.5)).toBeCloseTo(0.5);
  });

  it('eases in and out, flat at both ends', () => {
    expect(easeTickerMotion(0.1)).toBeLessThan(0.1);
    expect(easeTickerMotion(0.9)).toBeGreaterThan(0.9);
  });

  it('clamps out-of-range progress', () => {
    expect(easeTickerMotion(-1)).toBe(0);
    expect(easeTickerMotion(2)).toBe(1);
  });
});

describe('pickAllowed', () => {
  it('returns the value when allowlisted', () => {
    expect(pickAllowed('right', TICKER_DIRECTIONS, 'left')).toBe('right');
    expect(pickAllowed('diagonal', PATTERN_SLUGS, 'none')).toBe('diagonal');
  });

  it('falls back when the value is missing or unknown', () => {
    expect(pickAllowed(undefined, TICKER_DIRECTIONS, 'left')).toBe('left');
    expect(pickAllowed('nope', PATTERN_SLUGS, 'none')).toBe('none');
  });
});

describe('isTickerPauseControl', () => {
  it('detects the pause button and its descendants', () => {
    const button = document.createElement('button');
    button.className = 'ticker__pause';
    const icon = document.createElement('span');
    button.appendChild(icon);

    expect(isTickerPauseControl(button)).toBe(true);
    expect(isTickerPauseControl(icon)).toBe(true);
    expect(isTickerPauseControl(document.createElement('div'))).toBe(false);
    expect(isTickerPauseControl(null)).toBe(false);
  });
});

describe('resolveTickerControlColor', () => {
  it('samples the first text-bearing child color', () => {
    const content = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.style.color = 'rgb(1, 2, 3)';
    content.appendChild(paragraph);
    document.body.appendChild(content);

    expect(resolveTickerControlColor(content)).toBe('rgb(1, 2, 3)');

    content.remove();
  });

  it('returns empty when content is missing', () => {
    expect(resolveTickerControlColor(null)).toBe('');
  });
});
