/**
 * Hardening regressions: magnetic pull, device tilt, input parsing,
 * nested blocks, and restoring authored styles on teardown.
 *
 * @jest-environment jsdom
 */

import {
  calculateMagneticForce,
  MAGNETIC_PX_PER_STRENGTH,
} from '../calculations';
import { applyParallaxDefaults } from '../config';
import { screenTilt } from '../engine';
import { collectLayers, restoreLayerStyles } from '../layers';
import { applyLayerFrame } from '../transforms';

afterEach(() => {
  document.body.innerHTML = '';
});

const layerMarkup = (attributes: Record<string, string>): HTMLElement => {
  const el = document.createElement('div');
  el.setAttribute('data-parallax-enabled', 'true');
  Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
};

describe('calculateMagneticForce', () => {
  it('produces a visible pull in pixels, scaled by strength', () => {
    // Pointer 50px right of center, range 200 → falloff 0.75.
    const force = calculateMagneticForce(100, 100, 150, 100, 1, 200, 'attract');
    expect(force.x).toBeCloseTo(0.75 * MAGNETIC_PX_PER_STRENGTH);
    expect(force.y).toBeCloseTo(0);
  });

  it('never drags the center past the pointer when attracting', () => {
    const force = calculateMagneticForce(100, 100, 103, 100, 2, 200, 'attract');
    expect(force.x).toBeCloseTo(3);
  });

  it('pushes away when repelling and ignores out-of-range pointers', () => {
    expect(
      calculateMagneticForce(100, 100, 150, 100, 1, 200, 'repel').x
    ).toBeLessThan(0);
    expect(
      calculateMagneticForce(100, 100, 900, 100, 1, 200, 'attract')
    ).toEqual({ x: 0, y: 0 });
    expect(calculateMagneticForce(100, 100, 150, 100, 1, 0, 'attract')).toEqual(
      { x: 0, y: 0 }
    );
  });
});

describe('magnetic layer is stable (no feedback loop)', () => {
  it('holds a steady offset across frames for a still pointer', () => {
    const ctx = applyParallaxDefaults({ enableMouseInteraction: true });
    const root = document.createElement('div');
    root.appendChild(
      layerMarkup({
        'data-parallax-effects': JSON.stringify({
          magneticMouse: {
            enabled: true,
            strength: 2,
            range: 400,
            mode: 'attract',
            elastic: false,
          },
        }),
      })
    );
    document.body.appendChild(root);
    const [layer] = collectLayers(root, ctx);

    // Simulate the browser: the rect moves with whatever we last wrote.
    const layoutLeft = 480;
    const layoutTop = 360;
    const readRect = (): void => {
      const [x, y] = (layer.element.style.translate || '0px 0px')
        .split(' ')
        .map(parseFloat);
      layer.rect = new DOMRect(layoutLeft + x, layoutTop + y, 40, 40);
    };

    const frame = {
      progress: 0.5,
      baseline: 0.5,
      // Pointer ~10px right of the layer center.
      pointerX: (layoutLeft + 30) / window.innerWidth - 0.5,
      pointerY: (layoutTop + 20) / window.innerHeight - 0.5,
      is3D: true,
    };

    const offsets: number[] = [];
    for (let i = 0; i < 6; i++) {
      readRect();
      applyLayerFrame(layer, frame, ctx);
      offsets.push(parseFloat(layer.element.style.translate));
    }
    // Settles immediately and stays put instead of flipping sides.
    expect(new Set(offsets.slice(1)).size).toBe(1);
    expect(offsets[offsets.length - 1]).toBeGreaterThan(0);
  });
});

describe('screenTilt', () => {
  it('maps device axes onto screen axes for each rotation', () => {
    expect(screenTilt(40, 5, 0)).toEqual({ x: 5, y: 40 });
    expect(screenTilt(40, 5, 90)).toEqual({ x: 40, y: -5 });
    expect(screenTilt(40, 5, 180)).toEqual({ x: -5, y: -40 });
    expect(screenTilt(40, 5, 270)).toEqual({ x: -40, y: 5 });
    expect(screenTilt(40, 5, -90)).toEqual({ x: -40, y: 5 });
  });
});

describe('collectLayers input hardening', () => {
  it('keeps an explicit speed of 0 and defaults junk to 1', () => {
    const root = document.createElement('div');
    root.append(
      layerMarkup({ 'data-parallax-speed': '0' }),
      layerMarkup({ 'data-parallax-speed': 'fast' })
    );
    const [still, junk] = collectLayers(root, applyParallaxDefaults({}));
    expect(still.speed).toBe(0);
    expect(junk.speed).toBe(1);
  });

  it('never resolves an easing name to an inherited Object method', () => {
    const root = document.createElement('div');
    root.append(layerMarkup({ 'data-parallax-easing': 'toString' }));
    const [layer] = collectLayers(root, applyParallaxDefaults({}));
    expect(layer.ease(0.4)).toBe(0.4);
  });

  it('leaves layers of a nested parallax block to that block', () => {
    const outer = document.createElement('div');
    outer.className = 'aggressive-apparel-parallax';
    const inner = document.createElement('div');
    inner.className = 'aggressive-apparel-parallax';
    const own = layerMarkup({});
    const nested = layerMarkup({});
    inner.append(nested);
    outer.append(own, inner);
    document.body.append(outer);

    const layers = collectLayers(outer, applyParallaxDefaults({}));
    expect(layers.map(layer => layer.element)).toEqual([own]);
  });
});

describe('restoreLayerStyles', () => {
  it("puts back the author's own inline styles on teardown", () => {
    const root = document.createElement('div');
    const el = layerMarkup({
      'data-parallax-depth': '50',
      'data-parallax-effects': JSON.stringify({
        colorTransition: {
          enabled: true,
          startColor: '#000000',
          endColor: '#ffffff',
          transitionType: 'background',
          effectStart: 0,
          effectEnd: 1,
        },
      }),
    });
    el.style.backgroundColor = 'rgb(1, 2, 3)';
    el.style.zIndex = '4';
    root.append(el);
    const ctx = applyParallaxDefaults({});
    const [layer] = collectLayers(root, ctx);

    applyLayerFrame(
      layer,
      { progress: 1, baseline: 0.5, pointerX: 0, pointerY: 0, is3D: false },
      ctx
    );
    expect(el.style.backgroundColor).toBe('rgb(255, 255, 255)');

    restoreLayerStyles(layer);
    expect(el.style.backgroundColor).toBe('rgb(1, 2, 3)');
    expect(el.style.zIndex).toBe('4');
    expect(el.style.translate).toBe('');
  });
});
