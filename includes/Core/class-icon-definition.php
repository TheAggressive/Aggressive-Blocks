<?php
/**
 * Icon definition normalizer.
 *
 * Turns a raw icon definition (a single path string, or a map of viewBox,
 * paths, circles, polygons, and rects in any of the accepted shapes) into the
 * render-ready primitives Icon_Markup prints. Anything malformed is dropped;
 * a definition with no usable shape normalizes to null.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Core;

/**
 * Normalizes icon definitions.
 */
final class Icon_Definition {

	/**
	 * Default viewBox for single-path and unspecified multi-path icons.
	 */
	public const DEFAULT_VIEWBOX = '0 0 24 24';

	/**
	 * Allowed optional attributes on path/circle/polygon/rect primitives.
	 *
	 * @var array<int, string>
	 */
	public const SHAPE_ATTRS = array(
		'fill',
		'fill-rule',
		'stroke',
		'stroke-width',
		'stroke-linecap',
		'stroke-linejoin',
		'opacity',
		'transform',
	);

	/**
	 * Normalize a slug definition into render-ready primitives.
	 *
	 * @param string|array<string, mixed> $definition Icon definition.
	 * @return array{
	 *     viewBox: string,
	 *     paths: array<int, array<string, string>>,
	 *     circles: array<int, array<string, string>>,
	 *     polygons: array<int, array<string, string>>,
	 *     rects: array<int, array<string, string>>
	 * }|null
	 */
	public static function normalize( string|array $definition ): ?array {
		if ( is_string( $definition ) ) {
			$path_data = trim( $definition );

			if ( '' === $path_data ) {
				return null;
			}

			return array(
				'viewBox'  => self::DEFAULT_VIEWBOX,
				'paths'    => array(
					array( 'd' => $path_data ),
				),
				'circles'  => array(),
				'polygons' => array(),
				'rects'    => array(),
			);
		}

		$view_box = self::DEFAULT_VIEWBOX;

		if ( isset( $definition['viewBox'] ) && is_string( $definition['viewBox'] ) ) {
			$sanitized_view_box = self::sanitize_view_box( $definition['viewBox'] );

			if ( null === $sanitized_view_box ) {
				return null;
			}

			$view_box = $sanitized_view_box;
		}

		$paths    = self::normalize_paths( $definition['paths'] ?? array() );
		$circles  = self::normalize_circles( $definition['circles'] ?? array() );
		$polygons = self::normalize_polygons( $definition['polygons'] ?? array() );
		$rects    = self::normalize_rects( $definition['rects'] ?? array() );

		if ( array() === $paths && array() === $circles && array() === $polygons && array() === $rects ) {
			return null;
		}

		return array(
			'viewBox'  => $view_box,
			'paths'    => $paths,
			'circles'  => $circles,
			'polygons' => $polygons,
			'rects'    => $rects,
		);
	}

	/**
	 * Normalize path entries from string or attribute arrays.
	 *
	 * @param mixed $paths Raw paths value.
	 * @return array<int, array<string, string>>
	 */
	private static function normalize_paths( mixed $paths ): array {
		if ( ! is_array( $paths ) ) {
			return array();
		}

		$normalized = array();

		foreach ( $paths as $path ) {
			if ( is_string( $path ) ) {
				$path_data = trim( $path );

				if ( '' !== $path_data ) {
					$normalized[] = array( 'd' => $path_data );
				}

				continue;
			}

			if ( ! is_array( $path ) || ! isset( $path['d'] ) || ! is_string( $path['d'] ) ) {
				continue;
			}

			$path_data = trim( $path['d'] );

			if ( '' === $path_data ) {
				continue;
			}

			$entry = array( 'd' => $path_data );

			foreach ( self::SHAPE_ATTRS as $attr ) {
				if ( ! isset( $path[ $attr ] ) || ! is_string( $path[ $attr ] ) ) {
					continue;
				}

				$value = trim( $path[ $attr ] );

				if ( '' !== $value ) {
					$entry[ $attr ] = $value;
				}
			}

			$normalized[] = $entry;
		}

		return $normalized;
	}

	/**
	 * Normalize circle entries from coordinate arrays or attribute maps.
	 *
	 * @param mixed $circles Raw circles value.
	 * @return array<int, array<string, string>>
	 */
	private static function normalize_circles( mixed $circles ): array {
		if ( ! is_array( $circles ) ) {
			return array();
		}

		$normalized = array();

		foreach ( $circles as $circle ) {
			if ( is_array( $circle ) && isset( $circle['cx'], $circle['cy'], $circle['r'] ) ) {
				$entry = array(
					'cx' => self::stringify_coordinate( $circle['cx'] ),
					'cy' => self::stringify_coordinate( $circle['cy'] ),
					'r'  => self::stringify_coordinate( $circle['r'] ),
				);

				if ( null === $entry['cx'] || null === $entry['cy'] || null === $entry['r'] ) {
					continue;
				}

				foreach ( self::SHAPE_ATTRS as $attr ) {
					if ( ! isset( $circle[ $attr ] ) || ! is_string( $circle[ $attr ] ) ) {
						continue;
					}

					$value = trim( $circle[ $attr ] );

					if ( '' !== $value ) {
						$entry[ $attr ] = $value;
					}
				}

				$normalized[] = $entry;

				continue;
			}

			if ( is_array( $circle ) && array_is_list( $circle ) && count( $circle ) >= 3 ) {
				$entry = array(
					'cx' => self::stringify_coordinate( $circle[0] ),
					'cy' => self::stringify_coordinate( $circle[1] ),
					'r'  => self::stringify_coordinate( $circle[2] ),
				);

				if ( null === $entry['cx'] || null === $entry['cy'] || null === $entry['r'] ) {
					continue;
				}

				$normalized[] = $entry;
			}
		}

		return $normalized;
	}

	/**
	 * Normalize polygon entries from string or attribute arrays.
	 *
	 * @param mixed $polygons Raw polygons value.
	 * @return array<int, array<string, string>>
	 */
	private static function normalize_polygons( mixed $polygons ): array {
		if ( ! is_array( $polygons ) ) {
			return array();
		}

		$normalized = array();

		foreach ( $polygons as $polygon ) {
			if ( is_string( $polygon ) ) {
				$points = trim( $polygon );

				if ( '' !== $points ) {
					$normalized[] = array( 'points' => $points );
				}

				continue;
			}

			if ( ! is_array( $polygon ) || ! isset( $polygon['points'] ) || ! is_string( $polygon['points'] ) ) {
				continue;
			}

			$points = trim( $polygon['points'] );

			if ( '' === $points ) {
				continue;
			}

			$entry = array( 'points' => $points );

			foreach ( self::SHAPE_ATTRS as $attr ) {
				if ( ! isset( $polygon[ $attr ] ) || ! is_string( $polygon[ $attr ] ) ) {
					continue;
				}

				$value = trim( $polygon[ $attr ] );

				if ( '' !== $value ) {
					$entry[ $attr ] = $value;
				}
			}

			$normalized[] = $entry;
		}

		return $normalized;
	}

	/**
	 * Normalize rect entries from coordinate arrays or attribute maps.
	 *
	 * @param mixed $rects Raw rects value.
	 * @return array<int, array<string, string>>
	 */
	private static function normalize_rects( mixed $rects ): array {
		if ( ! is_array( $rects ) ) {
			return array();
		}

		$normalized = array();

		foreach ( $rects as $rect ) {
			if ( ! is_array( $rect ) ) {
				continue;
			}

			if ( isset( $rect['x'], $rect['y'], $rect['width'], $rect['height'] ) ) {
				$entry = array(
					'x'      => self::stringify_coordinate( $rect['x'] ),
					'y'      => self::stringify_coordinate( $rect['y'] ),
					'width'  => self::stringify_coordinate( $rect['width'] ),
					'height' => self::stringify_coordinate( $rect['height'] ),
				);

				if ( in_array( null, $entry, true ) ) {
					continue;
				}

				if ( isset( $rect['transform'] ) && is_string( $rect['transform'] ) ) {
					$transform = trim( $rect['transform'] );

					if ( '' !== $transform ) {
						$entry['transform'] = $transform;
					}
				}

				foreach ( self::SHAPE_ATTRS as $attr ) {
					if ( ! isset( $rect[ $attr ] ) || ! is_string( $rect[ $attr ] ) ) {
						continue;
					}

					$value = trim( $rect[ $attr ] );

					if ( '' !== $value ) {
						$entry[ $attr ] = $value;
					}
				}

				$normalized[] = $entry;

				continue;
			}

			if ( array_is_list( $rect ) && count( $rect ) >= 4 ) {
				$entry = array(
					'x'      => self::stringify_coordinate( $rect[0] ),
					'y'      => self::stringify_coordinate( $rect[1] ),
					'width'  => self::stringify_coordinate( $rect[2] ),
					'height' => self::stringify_coordinate( $rect[3] ),
				);

				if ( in_array( null, $entry, true ) ) {
					continue;
				}

				if ( isset( $rect[4] ) && is_string( $rect[4] ) ) {
					$transform = trim( $rect[4] );

					if ( '' !== $transform ) {
						$entry['transform'] = $transform;
					}
				}

				$normalized[] = $entry;
			}
		}

		return $normalized;
	}

	/**
	 * Sanitize an SVG viewBox value.
	 *
	 * @param string $view_box Raw viewBox.
	 * @return string|null
	 */
	private static function sanitize_view_box( string $view_box ): ?string {
		$view_box = trim( preg_replace( '/\s+/', ' ', $view_box ) ?? '' );

		if ( ! preg_match( '/^-?\d+(?:\.\d+)?(?:\s-?\d+(?:\.\d+)?){3}$/', $view_box ) ) {
			return null;
		}

		return $view_box;
	}

	/**
	 * Convert a numeric coordinate to a safe string.
	 *
	 * @param mixed $value Coordinate value.
	 * @return string|null
	 */
	private static function stringify_coordinate( mixed $value ): ?string {
		if ( is_int( $value ) ) {
			return (string) $value;
		}

		if ( is_float( $value ) ) {
			return rtrim( rtrim( sprintf( '%.4F', $value ), '0' ), '.' );
		}

		if ( is_string( $value ) && is_numeric( $value ) ) {
			return self::stringify_coordinate( (float) $value );
		}

		return null;
	}
}
