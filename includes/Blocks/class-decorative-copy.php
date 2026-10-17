<?php
/**
 * Remove interactive identity from decorative ticker copies before hydration.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Blocks;

/** Decorative copies must not hydrate a second instance of nested blocks. */
class Decorative_Copy {

	/**
	 * Strip IDs, live regions and Interactivity directives, preserving visuals.
	 *
	 * @param string $html Rendered original content.
	 * @return string
	 */
	public static function sanitize( string $html ): string {
		$tags = new \WP_HTML_Tag_Processor( $html );
		while ( $tags->next_tag() ) {
			foreach ( $tags->get_attribute_names_with_prefix( 'data-wp-' ) ?? array() as $name ) {
				$tags->remove_attribute( $name );
			}
			foreach ( array( 'id', 'aria-live', 'aria-atomic' ) as $name ) {
				$tags->remove_attribute( $name );
			}
		}
		return $tags->get_updated_html();
	}
}
