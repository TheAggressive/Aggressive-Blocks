/**
 * Utility barrel for the Parallax block — only the symbols actually
 * consumed by the runtime are surfaced here.
 *
 * @package Aggressive Apparel
 */

export {
  calculateBlur,
  calculateColorTransition,
  calculateMagneticForce,
  calculateRotation,
  calculateScrollOpacity,
  calculateShadow,
  clamp,
} from '../calculations';
export {
  calculateProgressWithinBoundary,
  measureProgressGeometry,
  parseBoundaryPart,
  progressFromGeometry,
  type ProgressGeometry,
  getObserverRootMargin,
  getValidIntersectionRatio,
  getVisibilityThreshold,
} from './geometry';
