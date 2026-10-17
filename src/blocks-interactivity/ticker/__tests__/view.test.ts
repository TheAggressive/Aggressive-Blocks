/** @jest-environment jsdom */
import type { TickerContext } from '../types';
import { PAUSE_STORAGE_KEY, PAUSE_EVENT } from '../constants';

let mockContext: TickerContext;
let mockRoot: HTMLElement;
const mockStore: {
  state?: { isPausedPressed: boolean };
  actions?: { togglePause: () => void };
  callbacks?: { init: () => () => void };
} = {};

jest.mock(
  '@wordpress/interactivity',
  () => ({
    store: (_name: string, config: unknown) => Object.assign(mockStore, config),
    getContext: () => mockContext,
    getElement: () => ({ ref: mockRoot }),
    withScope: (fn: unknown) => fn,
  }),
  { virtual: true }
);
jest.mock('../runtime', () => ({
  setupTicker: jest.fn(),
  destroyTicker: jest.fn(),
}));

beforeAll(async () => {
  await import('../view');
});
let matches = false;
let change: (() => void) | undefined;
const removeChange = jest.fn();
let cleanup: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
  matches = false;
  change = undefined;
  removeChange.mockClear();
  mockRoot = document.createElement('div');
  mockRoot.innerHTML = '<button class="ticker__pause">Pause</button>';
  document.body.append(mockRoot);
  mockContext = {
    isPaused: false,
    isHeld: false,
    pauseOnHover: true,
    motionLocked: false,
    controlLabel: 'Pause animation',
    i18n: { play: 'Play animation', pause: 'Pause animation' },
  };
  window.matchMedia = jest.fn(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_event: string, listener: () => void) => {
      change = listener;
    },
    removeEventListener: removeChange,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
  localStorage.clear();
});

it('keeps keyboard focus on Pause and Play, and clears temporary holds on Play', () => {
  cleanup = mockStore.callbacks!.init();
  const control = mockRoot.querySelector('button')!;
  control.focus();
  mockStore.actions!.togglePause();
  expect(document.activeElement).toBe(control);
  expect(mockContext.isPaused).toBe(true);
  expect(mockContext.controlLabel).toBe('Play animation');
  mockContext.isHeld = true;
  mockStore.actions!.togglePause();
  expect(document.activeElement).toBe(control);
  expect(mockContext.isHeld).toBe(false);
  expect(mockContext.controlLabel).toBe('Pause animation');
});

it('updates the motion lock live without overwriting the manual pause preference', () => {
  cleanup = mockStore.callbacks!.init();
  matches = true;
  change!();
  expect(mockContext.motionLocked).toBe(true);
  expect(mockContext.controlLabel).toBe('Play animation');
  expect(mockStore.state!.isPausedPressed).toBe(true);
  mockStore.actions!.togglePause();
  expect(mockContext.isPaused).toBe(false);
  matches = false;
  change!();
  expect(mockContext.motionLocked).toBe(false);
  expect(mockContext.controlLabel).toBe('Pause animation');
  mockStore.actions!.togglePause();
  matches = true;
  change!();
  matches = false;
  change!();
  expect(mockContext.isPaused).toBe(true);
  expect(localStorage.getItem(PAUSE_STORAGE_KEY)).toBe('1');
  cleanup();
  cleanup = undefined;
  expect(removeChange).toHaveBeenCalledWith('change', change);
});

it('starts locked and follows pause preferences from other tickers while locked', () => {
  matches = true;
  cleanup = mockStore.callbacks!.init();
  expect(mockContext.motionLocked).toBe(true);
  expect(mockStore.state!.isPausedPressed).toBe(true);
  document.dispatchEvent(new CustomEvent(PAUSE_EVENT, { detail: true }));
  matches = false;
  change!();
  expect(mockContext.isPaused).toBe(true);
  expect(mockContext.controlLabel).toBe('Play animation');
});
