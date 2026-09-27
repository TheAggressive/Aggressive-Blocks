/**
 * Tests for ticker preference helpers.
 *
 * @jest-environment jsdom
 */

import {
  canUseHoverPause,
  prefersReducedMotion,
  readStoredPause,
  whenDocumentFontsReady,
  writeStoredPause,
} from '../prefs';
import { PAUSE_STORAGE_KEY } from '../constants';

describe('prefersReducedMotion', () => {
  it('reads the prefers-reduced-motion media query', () => {
    const matchMedia = jest.fn().mockReturnValue({ matches: true });
    window.matchMedia = matchMedia as typeof window.matchMedia;

    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});

describe('canUseHoverPause', () => {
  it('requires a fine pointer with real hover', () => {
    const matchMedia = jest.fn().mockReturnValue({ matches: false });
    window.matchMedia = matchMedia as typeof window.matchMedia;

    expect(canUseHoverPause()).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith(
      '(hover: hover) and (pointer: fine)'
    );
  });
});

describe('stored pause', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it('round-trips a manual pause', () => {
    expect(readStoredPause()).toBe(false);

    writeStoredPause(true);
    expect(window.localStorage.getItem(PAUSE_STORAGE_KEY)).toBe('1');
    expect(readStoredPause()).toBe(true);

    writeStoredPause(false);
    expect(window.localStorage.getItem(PAUSE_STORAGE_KEY)).toBeNull();
    expect(readStoredPause()).toBe(false);
  });

  it('treats throwing storage as unset and never throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readStoredPause()).toBe(false);
    expect(() => writeStoredPause(true)).not.toThrow();
  });
});

describe('whenDocumentFontsReady', () => {
  it('resolves immediately when document.fonts is unavailable', async () => {
    const original = document.fonts;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: undefined,
    });

    await expect(whenDocumentFontsReady()).resolves.toBeUndefined();

    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: original,
    });
  });

  it('waits for document.fonts.ready when available', async () => {
    const original = document.fonts;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });

    await expect(whenDocumentFontsReady()).resolves.toBeUndefined();

    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: original,
    });
  });
});
