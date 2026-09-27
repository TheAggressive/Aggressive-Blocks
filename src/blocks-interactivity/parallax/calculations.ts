/**
 * Utility functions for parallax calculations and operations
 *
 * @package Aggressive Apparel
 */

/**
 * Clamps a number between a minimum and maximum value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Effect mode types for controlling animation behavior
 * - sustain: Reach maximum and hold (good for permanent changes)
 * - peek: Bell curve - fade in, peak at center, fade out (best for transient effects)
 * - reverse: Fade in then completely fade back out
 */
export type EffectMode = 'sustain' | 'peek' | 'reverse';

/**
 * Map scroll progress to effect-specific range with support for different animation modes.
 * This allows effects to start and complete at configurable points with various behaviors.
 *
 * @param scrollProgress - Raw scroll progress from 0 to 1
 * @param effectStart - When effect should start (0-1), default 0
 * @param effectEnd - When effect should end (0-1), default 1
 * @param mode - Animation mode: 'sustain', 'peek', or 'reverse'
 * @returns Remapped progress for effect calculation (0-1)
 *
 * @example
 * // Sustain mode: starts at 20%, reaches max at 70%, holds until 100%
 * mapProgressToEffectRange(0.8, 0.2, 0.7, 'sustain') // Returns 1.0
 *
 * @example
 * // Peek mode: bell curve - fade in 10-40%, peak 40-60%, fade out 60-90%
 * mapProgressToEffectRange(0.5, 0.1, 0.9, 'peek') // Returns 1.0 (at peak)
 * mapProgressToEffectRange(0.75, 0.1, 0.9, 'peek') // Returns 0.5 (fading out)
 */
export function mapProgressToEffectRange(
  scrollProgress: number,
  effectStart: number = 0,
  effectEnd: number = 1,
  mode: EffectMode = 'sustain'
): number {
  // Clamp input range values
  const start = Math.max(0, Math.min(1, effectStart));
  const end = Math.max(0, Math.min(1, effectEnd));

  // Handle invalid range (end must be greater than start)
  if (end <= start) return scrollProgress;

  // Before effect starts, return 0
  if (scrollProgress <= start) return 0;

  // After effect ends, behavior depends on mode
  if (scrollProgress >= end) {
    return mode === 'reverse' ? 0 : 1;
  }

  // Within effect range, calculate based on mode
  const normalizedProgress = (scrollProgress - start) / (end - start);

  switch (mode) {
    case 'sustain':
      // Linear interpolation - reaches max and stays
      return normalizedProgress;

    case 'peek': {
      // Bell curve: fade in (0-0.5), peak at 0.5, fade out (0.5-1)
      // Using smooth sine curve for natural motion
      if (normalizedProgress <= 0.5) {
        // Fade in: 0 to 1
        return Math.sin(normalizedProgress * Math.PI);
      } else {
        // Fade out: 1 to 0
        return Math.sin((1 - normalizedProgress) * Math.PI);
      }
    }

    case 'reverse': {
      // Fade in then reverse: 0 to 1 to 0
      // Using sine for smooth motion
      return Math.sin(normalizedProgress * Math.PI);
    }

    default:
      return normalizedProgress;
  }
}

/**
 * Calculate scroll-based opacity
 */
export function calculateScrollOpacity(
  scrollProgress: number,
  fadeRange: 'top' | 'middle' | 'bottom' | 'full',
  startOpacity: number,
  endOpacity: number,
  effectStart: number = 0,
  effectEnd: number = 1,
  mode: EffectMode = 'sustain'
): number {
  // Map scroll progress to effect range first
  const mappedProgress = mapProgressToEffectRange(
    scrollProgress,
    effectStart,
    effectEnd,
    mode
  );

  let rangeProgress: number;

  switch (fadeRange) {
    case 'top':
      rangeProgress = Math.min(mappedProgress * 2, 1);
      break;
    case 'bottom':
      rangeProgress = Math.max((mappedProgress - 0.5) * 2, 0);
      break;
    case 'middle':
      rangeProgress =
        mappedProgress < 0.5 ? mappedProgress * 2 : (1 - mappedProgress) * 2;
      break;
    case 'full':
    default:
      rangeProgress = mappedProgress;
      break;
  }

  return startOpacity + (endOpacity - startOpacity) * rangeProgress;
}

/**
 * Peak magnetic displacement (px) per unit of the editor's Strength
 * control (0.1–2): the default 0.5 pulls up to 12px, the maximum 2 up
 * to 48px. Strength used to be applied as raw pixels, which capped the
 * whole effect at an invisible 2px.
 */
export const MAGNETIC_PX_PER_STRENGTH = 24;

/**
 * Calculate magnetic force towards/away from the pointer.
 *
 * `centerX`/`centerY` must be the element's center WITHOUT its own
 * magnetic offset applied — measuring from the already-pulled position
 * feeds the output back into the input and makes the layer oscillate.
 */
export function calculateMagneticForce(
  centerX: number,
  centerY: number,
  mouseX: number,
  mouseY: number,
  strength: number,
  range: number,
  mode: 'attract' | 'repel'
): { x: number; y: number } {
  const deltaX = mouseX - centerX;
  const deltaY = mouseY - centerY;
  const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

  if (!(range > 0) || distance > range || distance === 0) {
    return { x: 0, y: 0 };
  }

  let force =
    (1 - distance / range) * Math.max(0, strength) * MAGNETIC_PX_PER_STRENGTH;
  if (mode !== 'repel') {
    // Attraction never drags the center past the pointer itself.
    force = Math.min(force, distance);
  }
  const multiplier = mode === 'repel' ? -1 : 1;

  return {
    x: (deltaX / distance) * force * multiplier,
    y: (deltaY / distance) * force * multiplier,
  };
}

/**
 * Calculate blur effect based on scroll progress
 */
export function calculateBlur(
  scrollProgress: number,
  startBlur: number,
  endBlur: number,
  fadeRange: 'top' | 'middle' | 'bottom' | 'full' = 'full',
  effectStart: number = 0,
  effectEnd: number = 1,
  mode: EffectMode = 'sustain'
): number {
  // Map scroll progress to effect range first
  const mappedProgress = mapProgressToEffectRange(
    scrollProgress,
    effectStart,
    effectEnd,
    mode
  );

  let rangeProgress: number;

  // Adjust progress based on fade range
  switch (fadeRange) {
    case 'top':
      rangeProgress = Math.min(mappedProgress * 2, 1);
      break;
    case 'bottom':
      rangeProgress = Math.max((mappedProgress - 0.5) * 2, 0);
      break;
    case 'middle':
      rangeProgress =
        mappedProgress < 0.5 ? mappedProgress * 2 : (1 - mappedProgress) * 2;
      break;
    case 'full':
    default:
      rangeProgress = mappedProgress;
      break;
  }

  return startBlur + (endBlur - startBlur) * rangeProgress;
}

/**
 * Interpolate between two colors
 */
export function calculateColorTransition(
  scrollProgress: number,
  startColor: string,
  endColor: string,
  effectStart: number = 0,
  effectEnd: number = 1,
  mode: EffectMode = 'sustain'
): string {
  // Map scroll progress to effect range first
  const mappedProgress = mapProgressToEffectRange(
    scrollProgress,
    effectStart,
    effectEnd,
    mode
  );

  // Parse colors to RGB(A) values
  const startRGB = parseColor(startColor);
  const endRGB = parseColor(endColor);

  if (!startRGB || !endRGB) {
    // If either color parsing fails, return the successfully parsed color
    // If both fail, return a safe fallback color
    if (startRGB) return formatColor(startRGB);
    if (endRGB) return formatColor(endRGB);
    return '#000000'; // Ultimate fallback for completely invalid colors
  }

  return formatColor({
    r: Math.round(startRGB.r + (endRGB.r - startRGB.r) * mappedProgress),
    g: Math.round(startRGB.g + (endRGB.g - startRGB.g) * mappedProgress),
    b: Math.round(startRGB.b + (endRGB.b - startRGB.b) * mappedProgress),
    a: startRGB.a + (endRGB.a - startRGB.a) * mappedProgress,
  });
}

interface RGBA {
  r: number;
  g: number;
  b: number;
  /** Alpha, 0..1. */
  a: number;
}

/** `rgb()` when opaque, `rgba()` otherwise (alpha to 3 decimals). */
function formatColor({ r, g, b, a }: RGBA): string {
  return a >= 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${+Math.max(0, a).toFixed(3)})`;
}

const clampChannel = (value: number): number =>
  Math.round(Math.min(255, Math.max(0, value)));

/** Alpha component: `0.5` or `50%`, clamped to 0..1 (absent = opaque). */
const parseAlpha = (value: string | undefined): number => {
  if (value === undefined) return 1;
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(1, Math.max(0, value.endsWith('%') ? num / 100 : num));
};

/**
 * Parse a CSS color string to RGBA. Handles named colors, #rgb/#rgba/
 * #rrggbb/#rrggbbaa, and rgb()/rgba()/hsl()/hsla() in both the legacy
 * comma syntax and the modern space syntax (`rgb(0 0 0 / 50%)`).
 */
export function parseColor(color: string): RGBA | null {
  const trimmedColor = color.trim().toLowerCase();

  // Handle named colors
  const namedColors: Record<string, string> = {
    aliceblue: '#f0f8ff',
    antiquewhite: '#faebd7',
    aqua: '#00ffff',
    aquamarine: '#7fffd4',
    azure: '#f0ffff',
    beige: '#f5f5dc',
    bisque: '#ffe4c4',
    black: '#000000',
    blanchedalmond: '#ffebcd',
    blue: '#0000ff',
    blueviolet: '#8a2be2',
    brown: '#a52a2a',
    burlywood: '#deb887',
    cadetblue: '#5f9ea0',
    chartreuse: '#7fff00',
    chocolate: '#d2691e',
    coral: '#ff7f50',
    cornflowerblue: '#6495ed',
    cornsilk: '#fff8dc',
    crimson: '#dc143c',
    cyan: '#00ffff',
    darkblue: '#00008b',
    darkcyan: '#008b8b',
    darkgoldenrod: '#b8860b',
    darkgray: '#a9a9a9',
    darkgrey: '#a9a9a9',
    darkgreen: '#006400',
    darkkhaki: '#bdb76b',
    darkmagenta: '#8b008b',
    darkolivegreen: '#556b2f',
    darkorange: '#ff8c00',
    darkorchid: '#9932cc',
    darkred: '#8b0000',
    darksalmon: '#e9967a',
    darkseagreen: '#8fbc8f',
    darkslateblue: '#483d8b',
    darkslategray: '#2f4f4f',
    darkslategrey: '#2f4f4f',
    darkturquoise: '#00ced1',
    darkviolet: '#9400d3',
    deeppink: '#ff1493',
    deepskyblue: '#00bfff',
    dimgray: '#696969',
    dimgrey: '#696969',
    dodgerblue: '#1e90ff',
    firebrick: '#b22222',
    floralwhite: '#fffaf0',
    forestgreen: '#228b22',
    fuchsia: '#ff00ff',
    gainsboro: '#dcdcdc',
    ghostwhite: '#f8f8ff',
    gold: '#ffd700',
    goldenrod: '#daa520',
    gray: '#808080',
    grey: '#808080',
    green: '#008000',
    greenyellow: '#adff2f',
    honeydew: '#f0fff0',
    hotpink: '#ff69b4',
    indianred: '#cd5c5c',
    indigo: '#4b0082',
    ivory: '#fffff0',
    khaki: '#f0e68c',
    lavender: '#e6e6fa',
    lavenderblush: '#fff0f5',
    lawngreen: '#7cfc00',
    lemonchiffon: '#fffacd',
    lightblue: '#add8e6',
    lightcoral: '#f08080',
    lightcyan: '#e0ffff',
    lightgoldenrodyellow: '#fafad2',
    lightgray: '#d3d3d3',
    lightgrey: '#d3d3d3',
    lightgreen: '#90ee90',
    lightpink: '#ffb6c1',
    lightsalmon: '#ffa07a',
    lightseagreen: '#20b2aa',
    lightskyblue: '#87ceeb',
    lightslategray: '#778899',
    lightslategrey: '#778899',
    lightsteelblue: '#b0c4de',
    lightyellow: '#ffffe0',
    lime: '#00ff00',
    limegreen: '#32cd32',
    linen: '#faf0e6',
    magenta: '#ff00ff',
    maroon: '#800000',
    mediumaquamarine: '#66cdaa',
    mediumblue: '#0000cd',
    mediumorchid: '#ba55d3',
    mediumpurple: '#9370db',
    mediumseagreen: '#3cb371',
    mediumslateblue: '#7b68ee',
    mediumspringgreen: '#00fa9a',
    mediumturquoise: '#48d1cc',
    mediumvioletred: '#c71585',
    midnightblue: '#191970',
    mintcream: '#f5fffa',
    mistyrose: '#ffe4e1',
    moccasin: '#ffe4b5',
    navajowhite: '#ffdead',
    navy: '#000080',
    oldlace: '#fdf5e6',
    olive: '#808000',
    olivedrab: '#6b8e23',
    orange: '#ffa500',
    orangered: '#ff4500',
    orchid: '#da70d6',
    palegoldenrod: '#eee8aa',
    palegreen: '#98fb98',
    paleturquoise: '#afeeee',
    palevioletred: '#db7093',
    papayawhip: '#ffefd5',
    peachpuff: '#ffdab9',
    peru: '#cd853f',
    pink: '#ffc0cb',
    plum: '#dda0dd',
    powderblue: '#b0e0e6',
    purple: '#800080',
    rebeccapurple: '#663399',
    red: '#ff0000',
    rosybrown: '#bc8f8f',
    royalblue: '#4169e1',
    saddlebrown: '#8b4513',
    salmon: '#fa8072',
    sandybrown: '#f4a460',
    seagreen: '#2e8b57',
    seashell: '#fff5ee',
    sienna: '#a0522d',
    silver: '#c0c0c0',
    skyblue: '#87ceeb',
    slateblue: '#6a5acd',
    slategray: '#708090',
    slategrey: '#708090',
    snow: '#fffafa',
    springgreen: '#00ff7f',
    steelblue: '#4682b4',
    tan: '#d2b48c',
    teal: '#008080',
    thistle: '#d8bfd8',
    tomato: '#ff6347',
    turquoise: '#40e0d0',
    violet: '#ee82ee',
    wheat: '#f5deb3',
    white: '#ffffff',
    whitesmoke: '#f5f5f5',
    yellow: '#ffff00',
    yellowgreen: '#9acd32',
  };

  if (Object.prototype.hasOwnProperty.call(namedColors, trimmedColor)) {
    return parseColor(namedColors[trimmedColor]);
  }
  if (trimmedColor === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  const hexMatch = trimmedColor.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map(ch => ch + ch)
        .join('');
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  // rgb()/rgba()/hsl()/hsla(), comma or space separated, optional alpha.
  const fnMatch = trimmedColor.match(/^(rgba?|hsla?)\((.*)\)$/);
  if (!fnMatch) {
    return null; // Unsupported color format
  }
  const parts = fnMatch[2]
    .replace('/', ' ')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) {
    return null;
  }
  const alpha = parseAlpha(parts[3]);

  if (fnMatch[1].startsWith('rgb')) {
    const channel = (part: string): number =>
      part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part);
    const [r, g, b] = parts.slice(0, 3).map(channel);
    if (![r, g, b].every(Number.isFinite)) return null;
    return {
      r: clampChannel(r),
      g: clampChannel(g),
      b: clampChannel(b),
      a: alpha,
    };
  }

  const h = parseFloat(parts[0]);
  const sat = parseFloat(parts[1]);
  const light = parseFloat(parts[2]);
  if (![h, sat, light].every(Number.isFinite)) return null;
  const rgb = hslToRgb(
    (((h % 360) + 360) % 360) / 360,
    Math.min(100, Math.max(0, sat)) / 100,
    Math.min(100, Math.max(0, light)) / 100
  );
  return { ...rgb, a: alpha };
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 1 / 6) {
    r = c;
    g = x;
    b = 0;
  } else if (1 / 6 <= h && h < 2 / 6) {
    r = x;
    g = c;
    b = 0;
  } else if (2 / 6 <= h && h < 3 / 6) {
    r = 0;
    g = c;
    b = x;
  } else if (3 / 6 <= h && h < 4 / 6) {
    r = 0;
    g = x;
    b = c;
  } else if (4 / 6 <= h && h < 5 / 6) {
    r = x;
    g = 0;
    b = c;
  } else if (5 / 6 <= h && h < 1) {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Calculate dynamic shadow effect
 */
export function calculateShadow(
  scrollProgress: number,
  startShadow: string,
  endShadow: string,
  effectStart: number = 0,
  effectEnd: number = 1,
  mode: EffectMode = 'sustain'
): string {
  // Map scroll progress to effect range first
  const mappedProgress = mapProgressToEffectRange(
    scrollProgress,
    effectStart,
    effectEnd,
    mode
  );

  return interpolateShadow(startShadow, endShadow, mappedProgress);
}

const SHADOW_NUMBER = /-?\d*\.?\d+/g;

/**
 * Interpolate two shadow strings number-by-number when they share the
 * same shape (e.g. `0px 0px 0px rgba(0,0,0,0)` → `10px 10px 20px
 * rgba(0,0,0,0.3)`), so offsets, blur, spread and rgba channels all blend
 * smoothly. Shapes that differ (other units, keywords, layer counts)
 * cannot be blended; those switch at the midpoint instead.
 */
export function interpolateShadow(
  startShadow: string,
  endShadow: string,
  progress: number
): string {
  const startNumbers = startShadow.match(SHADOW_NUMBER) ?? [];
  const endNumbers = endShadow.match(SHADOW_NUMBER) ?? [];
  const sameShape =
    startNumbers.length === endNumbers.length &&
    startShadow.replace(SHADOW_NUMBER, '#') ===
      endShadow.replace(SHADOW_NUMBER, '#');

  if (!sameShape) {
    return progress < 0.5 ? startShadow : endShadow;
  }

  let index = 0;
  return startShadow.replace(SHADOW_NUMBER, () => {
    const from = parseFloat(startNumbers[index]);
    const to = parseFloat(endNumbers[index]);
    index++;
    return String(+(from + (to - from) * progress).toFixed(3));
  });
}

/**
 * Calculate rotation effect
 */
export function calculateRotation(
  scrollProgress: number,
  startRotation: number,
  endRotation: number,
  speed: number = 1.0,
  rotationMode: 'range' | 'continuous' | 'looping' = 'range',
  effectStart: number = 0,
  effectEnd: number = 1,
  effectMode: EffectMode = 'sustain'
): number {
  // Map scroll progress to effect range first
  const mappedProgress = mapProgressToEffectRange(
    scrollProgress,
    effectStart,
    effectEnd,
    effectMode
  );

  const baseRotation = startRotation;
  const rotationRange = endRotation - startRotation;

  switch (rotationMode) {
    case 'continuous':
      // Continuous rotation: keeps spinning as you scroll
      // Speed determines how fast it rotates per scroll unit
      return baseRotation + mappedProgress * 360 * speed;

    case 'looping': {
      // Looping: resets to start when reaching end, creating a repeating cycle
      const totalRotation = rotationRange * speed;
      const progressInCycle = (mappedProgress * totalRotation) % 360;
      return baseRotation + progressInCycle;
    }

    case 'range':
    default:
      // Range: linear interpolation between start and end angles
      return baseRotation + rotationRange * speed * mappedProgress;
  }
}
