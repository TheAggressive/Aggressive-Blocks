<?php
/**
 * Icon SVG markup builder.
 *
 * Prints normalized icon primitives (see Icon_Definition) as escaped SVG:
 * the root <svg> attributes and the inner path/polygon/rect/circle elements.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Core;

/**
 * Builds SVG markup for normalized icons.
 */
final class Icon_Markup {

	/**
	 * Build sanitized root <svg> attributes.
	 *
	 * @param array<string, mixed> $attrs    Render attributes.
	 * @param string               $view_box View box string.
	 * @return string
	 */
	public static function root_attrs( array $attrs, string $view_box ): string {
		$svg_attrs = sprintf(
			'xmlns="http://www.w3.org/2000/svg" viewBox="%s" width="%d" height="%d" fill="%s"',
			esc_attr( $view_box ),
			absint( $attrs['width'] ),
			absint( $attrs['height'] ),
			esc_attr( is_string( $attrs['fill'] ) ? $attrs['fill'] : 'currentColor' )
		);

		if ( isset( $attrs['class'] ) && is_string( $attrs['class'] ) ) {
			$svg_attrs .= sprintf( ' class="%s"', esc_attr( $attrs['class'] ) );
		}

		if ( isset( $attrs['aria-hidden'] ) ) {
			$svg_attrs .= sprintf( ' aria-hidden="%s"', esc_attr( (string) $attrs['aria-hidden'] ) );
		}

		return $svg_attrs;
	}

	/**
	 * Build inner SVG primitives markup.
	 *
	 * @param array{viewBox:string,paths:array<int,array<string,string>>,circles:array<int,array<string,string>>,polygons:array<int,array<string,string>>,rects:array<int,array<string,string>>} $definition Normalized icon.
	 * @return string
	 */
	public static function inner( array $definition ): string {
		$parts = array();

		foreach ( $definition['paths'] as $path ) {
			$markup = self::build_path_markup( $path );

			if ( '' !== $markup ) {
				$parts[] = $markup;
			}
		}

		foreach ( $definition['polygons'] as $polygon ) {
			$markup = self::build_polygon_markup( $polygon );

			if ( '' !== $markup ) {
				$parts[] = $markup;
			}
		}

		foreach ( $definition['rects'] as $rect ) {
			$markup = self::build_rect_markup( $rect );

			if ( '' !== $markup ) {
				$parts[] = $markup;
			}
		}

		foreach ( $definition['circles'] as $circle ) {
			$markup = self::build_circle_markup( $circle );

			if ( '' !== $markup ) {
				$parts[] = $markup;
			}
		}

		return implode( '', $parts );
	}

	/**
	 * Build a single <path /> element.
	 *
	 * @param array<string, string> $path Path attributes.
	 * @return string
	 */
	private static function build_path_markup( array $path ): string {
		if ( ! isset( $path['d'] ) || '' === trim( $path['d'] ) ) {
			return '';
		}

		$attrs = sprintf( 'd="%s"', esc_attr( $path['d'] ) );

		foreach ( Icon_Definition::SHAPE_ATTRS as $attr ) {
			if ( ! isset( $path[ $attr ] ) || '' === trim( $path[ $attr ] ) ) {
				continue;
			}

			$attrs .= sprintf( ' %s="%s"', esc_attr( $attr ), esc_attr( $path[ $attr ] ) );
		}

		return sprintf( '<path %s/>', $attrs );
	}

	/**
	 * Build a single <polygon /> element.
	 *
	 * @param array<string, string> $polygon Polygon attributes.
	 * @return string
	 */
	private static function build_polygon_markup( array $polygon ): string {
		if ( ! isset( $polygon['points'] ) || '' === trim( $polygon['points'] ) ) {
			return '';
		}

		$attrs = sprintf( 'points="%s"', esc_attr( $polygon['points'] ) );

		foreach ( Icon_Definition::SHAPE_ATTRS as $attr ) {
			if ( ! isset( $polygon[ $attr ] ) || '' === trim( $polygon[ $attr ] ) ) {
				continue;
			}

			$attrs .= sprintf( ' %s="%s"', esc_attr( $attr ), esc_attr( $polygon[ $attr ] ) );
		}

		return sprintf( '<polygon %s/>', $attrs );
	}

	/**
	 * Build a single <rect /> element.
	 *
	 * @param array<string, string> $rect Rect attributes.
	 * @return string
	 */
	private static function build_rect_markup( array $rect ): string {
		if ( ! isset( $rect['x'], $rect['y'], $rect['width'], $rect['height'] ) ) {
			return '';
		}

		$attrs = sprintf(
			'x="%s" y="%s" width="%s" height="%s"',
			esc_attr( $rect['x'] ),
			esc_attr( $rect['y'] ),
			esc_attr( $rect['width'] ),
			esc_attr( $rect['height'] )
		);

		foreach ( Icon_Definition::SHAPE_ATTRS as $attr ) {
			if ( ! isset( $rect[ $attr ] ) || '' === trim( $rect[ $attr ] ) ) {
				continue;
			}

			$attrs .= sprintf( ' %s="%s"', esc_attr( $attr ), esc_attr( $rect[ $attr ] ) );
		}

		return sprintf( '<rect %s/>', $attrs );
	}

	/**
	 * Build a single <circle /> element.
	 *
	 * @param array<string, string> $circle Circle attributes.
	 * @return string
	 */
	private static function build_circle_markup( array $circle ): string {
		if ( ! isset( $circle['cx'], $circle['cy'], $circle['r'] ) ) {
			return '';
		}

		$attrs = sprintf(
			'cx="%s" cy="%s" r="%s"',
			esc_attr( $circle['cx'] ),
			esc_attr( $circle['cy'] ),
			esc_attr( $circle['r'] )
		);

		foreach ( Icon_Definition::SHAPE_ATTRS as $attr ) {
			if ( ! isset( $circle[ $attr ] ) || '' === trim( $circle[ $attr ] ) ) {
				continue;
			}

			$attrs .= sprintf( ' %s="%s"', esc_attr( $attr ), esc_attr( $circle[ $attr ] ) );
		}

		return sprintf( '<circle %s/>', $attrs );
	}
}
