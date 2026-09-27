/**
 * Native scroll-timeline renderer: range/inset mapping, keyframe parity
 * with the JS frame renderer, and graceful fallback.
 *
 * @jest-environment jsdom
 */

import { applyParallaxDefaults } from '../config';
import { collectLayers, type CachedLayer } from '../layers';
import {
  buildLayerKeyframes,
  sampleOffsets,
  scrollsWithViewport,
  startTimelineAnimations,
  timelineRangeStart,
  viewTimelineInset,
} from '../timeline';
import { applyLayerFrame, computeScrollFrame } from '../transforms';
import type { ParallaxContext } from '../types';

const buildLayer = (
  attributes: Record<string, string>,
  ctxOverrides: Partial<ParallaxContext> = {}
): { layer: CachedLayer; ctx: ParallaxContext; root: HTMLElement } => {
  const ctx = applyParallaxDefaults(ctxOverrides);
  const root = document.createElement('div');
  const el = document.createElement('div');
  el.setAttribute('data-parallax-enabled', 'true');
  Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v));
  root.appendChild(el);
  document.body.appendChild(root);
  const [layer] = collectLayers(root, ctx);
  return { layer, ctx, root };
};

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('style');
  delete (globalThis as { ViewTimeline?: unknown }).ViewTimeline;
});

describe('timeline range mapping', () => {
  it('negates boundary sides into a view-timeline inset (top, bottom)', () => {
    expect(
      viewTimelineInset({ top: '10%', right: '5%', bottom: '-40px', left: '0' })
    ).toBe('-10% 40px');
  });

  it('treats zero and unparseable sides as no inset', () => {
    expect(
      viewTimelineInset({ top: '0%', right: '', bottom: 'auto', left: '' })
    ).toBe('0px 0px');
  });

  it('maps visibilityTrigger onto the subject-height entry-crossing range', () => {
    expect(timelineRangeStart(0.3)).toBe('entry-crossing 30%');
    expect(timelineRangeStart(0)).toBe('entry-crossing 0%');
    expect(timelineRangeStart(NaN)).toBe('entry-crossing 0%');
  });
});

describe('keyframe sampling', () => {
  it('samples exactly at effect-window corners', () => {
    const { layer } = buildLayer({
      'data-parallax-effects': JSON.stringify({
        scrollOpacity: {
          enabled: true,
          startOpacity: 0,
          endOpacity: 1,
          fadeRange: 'full',
          effectStart: 0.13,
          effectEnd: 0.71,
          effectMode: 'peek',
        },
      }),
    });
    const offsets = sampleOffsets(layer);
    expect(offsets).toEqual(expect.arrayContaining([0, 0.13, 0.42, 0.71, 1]));
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it('matches the JS frame renderer at every keyframe', () => {
    const { layer, ctx } = buildLayer(
      {
        'data-parallax-depth': '40',
        'data-parallax-easing': 'easeInOut',
        'data-parallax-effects': JSON.stringify({
          zoom: { enabled: true, type: 'in', intensity: 0.3 },
          scrollOpacity: {
            enabled: true,
            startOpacity: 0.2,
            endOpacity: 1,
            fadeRange: 'full',
            effectStart: 0,
            effectEnd: 0.5,
          },
        }),
      },
      { intensity: 80 }
    );
    const baseline = 0.37;
    const { composited } = buildLayerKeyframes(layer, baseline, ctx);
    expect(composited).not.toBeNull();

    composited!.forEach(keyframe => {
      applyLayerFrame(
        layer,
        {
          progress: keyframe.offset as number,
          baseline,
          pointerX: 0,
          pointerY: 0,
          is3D: false,
        },
        ctx
      );
      expect(keyframe.translate).toBe(layer.element.style.translate);
      expect(parseFloat(keyframe.opacity as string)).toBe(
        parseFloat(layer.element.style.opacity)
      );
      expect(parseFloat(keyframe.scale as string)).toBeCloseTo(
        parseFloat(layer.element.style.scale || '1'),
        4
      );
    });
  });

  it('splits paint-only properties into their own keyframe set', () => {
    const { layer, ctx } = buildLayer({
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
    const { composited, paint } = buildLayerKeyframes(layer, 0.5, ctx);
    expect(paint?.[0]).toHaveProperty('backgroundColor');
    expect(composited?.[0]).not.toHaveProperty('backgroundColor');
  });

  it('builds no animation for a layer that never changes', () => {
    const { layer, ctx } = buildLayer({
      'data-parallax-direction': 'none',
    });
    expect(buildLayerKeyframes(layer, 0.5, ctx)).toEqual({
      composited: null,
      paint: null,
    });
  });
});

describe('startTimelineAnimations', () => {
  const installViewTimeline = (): jest.Mock => {
    const ctor = jest.fn(function (this: object, options: object) {
      Object.assign(this, { options });
    });
    (globalThis as { ViewTimeline?: unknown }).ViewTimeline = ctor;
    return ctor;
  };

  it('binds each layer to a view timeline with the mapped range', () => {
    const ctor = installViewTimeline();
    const { layer, ctx, root } = buildLayer(
      { 'data-parallax-depth': '20' },
      {
        visibilityTrigger: 0.25,
        detectionBoundary: {
          top: '10%',
          right: '0%',
          bottom: '0%',
          left: '0%',
        },
      }
    );
    const animation = { cancel: jest.fn() };
    const animate = jest.fn(() => animation);
    layer.element.animate = animate as unknown as HTMLElement['animate'];

    const result = startTimelineAnimations(root, [layer], ctx, 0.5);

    expect(result).toEqual([animation]);
    expect(ctor).toHaveBeenCalledWith({
      subject: root,
      axis: 'block',
      inset: '-10% 0px',
    });
    expect(animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        rangeStart: 'entry-crossing 25%',
        rangeEnd: 'cover 100%',
        fill: 'both',
      })
    );
  });

  it('cancels partial work and reports failure when the browser throws', () => {
    installViewTimeline();
    const first = buildLayer({ 'data-parallax-depth': '20' });
    const second = buildLayer({ 'data-parallax-depth': '30' });
    const started = { cancel: jest.fn() };
    first.layer.element.animate = jest.fn(
      () => started
    ) as unknown as HTMLElement['animate'];
    second.layer.element.animate = jest.fn(() => {
      throw new TypeError('bad range');
    }) as unknown as HTMLElement['animate'];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = startTimelineAnimations(
      first.root,
      [first.layer, second.layer],
      first.ctx,
      0.5
    );

    expect(result).toBeNull();
    expect(started.cancel).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns null without ViewTimeline support', () => {
    const { layer, ctx, root } = buildLayer({});
    expect(startTimelineAnimations(root, [layer], ctx, 0.5)).toBeNull();
  });
});

describe('scrollsWithViewport', () => {
  it('accepts a block in normal page flow', () => {
    const { root } = buildLayer({});
    expect(scrollsWithViewport(root)).toBe(true);
  });

  it('rejects a block inside a nested scroll container', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const { root } = buildLayer({});
    scroller.appendChild(root);
    document.body.appendChild(scroller);
    expect(scrollsWithViewport(root)).toBe(false);
  });

  it('rejects a non-propagated body scroller (html and body both clip)', () => {
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';
    const { root } = buildLayer({});
    expect(scrollsWithViewport(root)).toBe(false);
    document.body.removeAttribute('style');
  });

  it('accepts body overflow that propagates to the viewport', () => {
    document.body.style.overflowX = 'hidden';
    const { root } = buildLayer({});
    expect(scrollsWithViewport(root)).toBe(true);
    document.body.removeAttribute('style');
  });
});

describe('computeScrollFrame effect composition', () => {
  it('keeps depth-of-field blur alongside a drop-shadow', () => {
    const { layer, ctx } = buildLayer(
      {
        'data-parallax-depth': '-50',
        'data-parallax-effects': JSON.stringify({
          dynamicShadow: {
            enabled: true,
            startShadow: '0px 0px 0px rgba(0,0,0,0)',
            endShadow: '0px 10px 20px rgba(0,0,0,0.5)',
            shadowType: 'drop-shadow',
            effectStart: 0,
            effectEnd: 1,
          },
        }),
      },
      { depthOfField: true }
    );
    const { styles } = computeScrollFrame(layer, 0.5, 0.5, ctx);
    expect(styles.filter).toMatch(/^blur\(3\.00px\) drop-shadow\(/);
  });

  it('routes axis rotations through the rotate property', () => {
    const { layer, ctx } = buildLayer({
      'data-parallax-effects': JSON.stringify({
        rotation: {
          enabled: true,
          startRotation: 0,
          endRotation: 90,
          axis: 'x',
          speed: 1,
          mode: 'range',
          effectStart: 0,
          effectEnd: 1,
          effectMode: 'sustain',
        },
      }),
    });
    const { styles } = computeScrollFrame(layer, 1, 0.5, ctx);
    expect(styles.rotate).toBe('x 90deg');
    expect(styles).not.toHaveProperty('transform');
  });
});
