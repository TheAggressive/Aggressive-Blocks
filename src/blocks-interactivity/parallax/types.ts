/**
 * Shared TypeScript types and interfaces for the Parallax block
 *
 * @package Aggressive Apparel
 */

/**
 * Direction options for parallax movement
 */
export type ParallaxDirection = 'up' | 'down' | 'both' | 'none';

/**
 * Easing function types
 */
export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

/**
 * Zoom effect types
 */
export type ZoomType = 'in' | 'out';

/**
 * Settings for individual parallax elements with validation
 */
export interface ElementSettings {
  speed: number;
  direction: ParallaxDirection;
  delay: number;
  easing: EasingType;
  /**
   * Signed depth, -100..100. Negative = behind the focal plane (moves
   * less, with the pointer), positive = in front (moves more, against
   * the pointer). 0 = focal plane.
   */
  depth?: number;
}

/**
 * Default per-element settings
 */
export interface DefaultElementSettings extends ElementSettings {
  enabled: boolean;
}

/**
 * Per-block parallax settings stored on `aggressiveApparelParallax`.
 */
export interface ElementParallaxSettings extends DefaultElementSettings {
  effects?: ParallaxEffects;
}

/** Block attributes that may include nested parallax element settings. */
export interface BlockAttributesWithParallax {
  aggressiveApparelParallax?: ElementParallaxSettings;
  [key: string]: unknown;
}

/**
 * Per-element effects
 */
export interface ParallaxEffects {
  zoom?: {
    enabled: boolean;
    type: ZoomType;
    intensity: number;
  };
  depthLevel?: {
    value: number;
  };
  zIndex?: {
    value: number;
  };
  scrollOpacity?: {
    enabled: boolean;
    startOpacity: number; // 0-1
    endOpacity: number; // 0-1
    fadeRange: 'top' | 'middle' | 'bottom' | 'full';
    effectStart?: number; // 0-1, when effect animation starts
    effectEnd?: number; // 0-1, when effect animation completes
    effectMode?: 'sustain' | 'peek' | 'reverse'; // Animation behavior (default: peek)
  };
  magneticMouse?: {
    enabled: boolean;
    strength: number; // 0-100
    range: number; // px distance
    elastic: boolean;
    mode: 'attract' | 'repel';
  };
  blur?: {
    enabled: boolean;
    startBlur: number; // CSS blur value (px)
    endBlur: number; // CSS blur value (px)
    fadeRange: 'top' | 'middle' | 'bottom' | 'full';
    effectStart?: number; // 0-1, when effect animation starts
    effectEnd?: number; // 0-1, when effect animation completes
    effectMode?: 'sustain' | 'peek' | 'reverse'; // Animation behavior (default: peek)
  };
  colorTransition?: {
    enabled: boolean;
    startColor: string; // Hex, RGB, or HSL color
    endColor: string; // Hex, RGB, or HSL color
    transitionType: 'background' | 'text' | 'border';
    effectStart?: number; // 0-1, when effect animation starts
    effectEnd?: number; // 0-1, when effect animation completes
    effectMode?: 'sustain' | 'peek' | 'reverse'; // Animation behavior (default: peek)
  };
  dynamicShadow?: {
    enabled: boolean;
    startShadow: string; // CSS box-shadow value
    endShadow: string; // CSS box-shadow value
    shadowType: 'box-shadow' | 'text-shadow' | 'drop-shadow';
    effectStart?: number; // 0-1, when effect animation starts
    effectEnd?: number; // 0-1, when effect animation completes
    effectMode?: 'sustain' | 'peek' | 'reverse'; // Animation behavior (default: peek)
  };
  rotation?: {
    enabled: boolean;
    startRotation: number; // degrees
    endRotation: number; // degrees
    axis: 'x' | 'y' | 'z' | 'all';
    speed: number; // multiplier for rotation speed (0.1 to 3.0)
    mode: 'range' | 'continuous' | 'looping'; // how rotation behaves
    effectStart?: number; // 0-1, when effect animation starts
    effectEnd?: number; // 0-1, when effect animation completes
    effectMode?: 'sustain' | 'peek' | 'reverse'; // Animation behavior (default: peek)
  };
  velocityBlur?: {
    enabled?: boolean;
    maxBlur?: number;
    sensitivity?: number;
    direction?: 'vertical' | 'horizontal' | string;
  };
}

/**
 * Detection boundary definition for advanced trigger control
 */
export interface DetectionBoundary {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/**
 * Parallax block attributes
 */
export type ParallaxAttributes = {
  intensity: number; // 0-200
  visibilityTrigger: number; // 0-1
  detectionBoundary: DetectionBoundary;
  /** Engine pre-activation buffer, % of viewport height (0 disables). */
  activationBuffer?: number;
  enableMouseInteraction: boolean;
  /**
   * When true, skip the motion engine (and CSS-nullify transforms) at
   * viewports ≤ 768px. Default false — mobile motion stays on.
   */
  disableOnMobile?: boolean;
  debugMode: boolean;

  parallaxDirection?: 'up' | 'down' | 'both';
  mouseInfluenceMultiplier?: number;
  maxMouseTranslation?: number;
  depthIntensityMultiplier?: number;
  transitionDuration?: number;
  perspectiveDistance?: number;
  maxMouseRotation?: number;
  depthOfField?: boolean;
};

/**
 * Parallax settings and runtime state
 */
export interface ParallaxContext {
  intensity: number;
  visibilityTrigger: number; // 0-1
  detectionBoundary: DetectionBoundary;
  /** Engine pre-activation buffer, % of viewport height (0 disables). */
  activationBuffer?: number;
  enableMouseInteraction: boolean;
  disableOnMobile?: boolean;
  debugMode: boolean;

  isIntersecting: boolean;
  intersectionRatio: number;
  hasInitialized?: boolean;
  previousProgress?: number; // Track previous progress for sticky effects

  parallaxDirection?: 'up' | 'down' | 'both';
  mouseInfluenceMultiplier?: number;
  maxMouseTranslation?: number;
  depthIntensityMultiplier?: number;
  transitionDuration?: number;
  perspectiveDistance?: number;
  maxMouseRotation?: number;
  /** Blur layers progressively as they sit further from the focal plane. */
  depthOfField?: boolean;

  /** Threshold the observer actually runs with (tall-element capped). */
  effectiveThreshold?: number;
  scrollProgress?: number;
  mouseX?: number;
  mouseY?: number;
  id?: string;
}
