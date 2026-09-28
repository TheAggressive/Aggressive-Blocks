<?php
/**
 * Block namespace migrator for saved content.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Migration;

/**
 * Renames aggressive-apparel/* blocks this plugin owns to aggressive-blocks/*.
 *
 * Saved content is a compatibility contract, so the rewrite is surgical:
 * WP_Block_Processor finds the delimiters parse_blocks() would see, and only
 * two things change, both exactly as the 2.0 editor would save them:
 *
 *  - the block name in each moved block's opening, closing, or void delimiter;
 *  - the block's own generated class (wp-block-aggressive-apparel-{slug}) on
 *    the root element of its saved HTML, for the blocks that save a wrapper.
 *
 * Every other byte is copied through, including attribute JSON, other blocks,
 * and text that merely mentions a legacy name.
 */
class Block_Renamer {

	/**
	 * Slugs that moved from aggressive-apparel to aggressive-blocks.
	 *
	 * Only these are renamed; other aggressive-apparel/* blocks still belong
	 * to the theme.
	 *
	 * @var array<int, string>
	 */
	public const SLUGS = array(
		'animate-on-scroll',
		'parallax',
		'modal',
		'card-flip',
		'card-flip-front',
		'card-flip-back',
		'horizontal-scroll',
		'hero-carousel',
		'ticker',
		'split-story',
		'split-story-media',
		'split-story-content',
		'copyright',
	);

	/**
	 * Candidate LIKE fragment.
	 */
	public const CANDIDATE_LIKE = '%<!-- wp:aggressive-apparel/%';

	private const LEGACY_NAMESPACE = 'aggressive-apparel/';

	private const CURRENT_NAMESPACE = 'aggressive-blocks/';

	/**
	 * Rewrite serialized block markup.
	 *
	 * @param string $content Post content.
	 * @return array{content: string, changed: bool, count: int}
	 */
	public static function rewrite( string $content ): array {
		$unchanged = array(
			'content' => $content,
			'changed' => false,
			'count'   => 0,
		);

		if ( ! str_contains( $content, 'wp:' . self::LEGACY_NAMESPACE ) ) {
			return $unchanged;
		}

		$processor    = new \WP_Block_Processor( $content );
		$output       = '';
		$copied_up_to = 0;
		$count        = 0;
		$opened_slug  = null;

		while ( $processor->next_token() ) {
			$span = $processor->get_span();
			if ( null === $span ) {
				continue;
			}

			$token = substr( $content, $span->start, $span->length );

			if ( $processor->is_html() ) {
				// The span right after a renamed opener holds its root element.
				$renamed     = null === $opened_slug ? $token : self::rename_wrapper_class( $token, $opened_slug );
				$opened_slug = null;
			} else {
				$opened_slug = null;
				$slug        = self::moved_slug( (string) $processor->get_block_type() );
				if ( null === $slug ) {
					continue;
				}

				$renamed = (string) preg_replace(
					'#^(<!--\s+/?wp:)' . preg_quote( self::LEGACY_NAMESPACE, '#' ) . '#',
					'$1' . self::CURRENT_NAMESPACE,
					$token,
					1
				);

				$type = $processor->get_delimiter_type();
				if ( \WP_Block_Processor::OPENER === $type ) {
					$opened_slug = $slug;
				}
				if ( \WP_Block_Processor::CLOSER !== $type ) {
					++$count;
				}
			}

			if ( $renamed !== $token ) {
				$output      .= substr( $content, $copied_up_to, $span->start - $copied_up_to ) . $renamed;
				$copied_up_to = $span->start + $span->length;
			}
		}

		if ( 0 === $count ) {
			return $unchanged;
		}

		return array(
			'content' => $output . substr( $content, $copied_up_to ),
			'changed' => true,
			'count'   => $count,
		);
	}

	/**
	 * The moved slug a fully-qualified block type names, if any.
	 *
	 * @param string $block_type Fully-qualified block type.
	 * @return string|null
	 */
	private static function moved_slug( string $block_type ): ?string {
		if ( ! str_starts_with( $block_type, self::LEGACY_NAMESPACE ) ) {
			return null;
		}

		$slug = substr( $block_type, strlen( self::LEGACY_NAMESPACE ) );

		return in_array( $slug, self::SLUGS, true ) ? $slug : null;
	}

	/**
	 * Rename the block's generated class on the first element of its HTML.
	 *
	 * Blocks that save a wrapper (card-flip faces, split-story columns, the
	 * 1.x modal) carry the class the editor derives from the block name.
	 * Left alone, the 2.0 editor flags those blocks as invalid.
	 *
	 * @param string $html Inner HTML span that follows the block's opener.
	 * @param string $slug Moved block slug.
	 * @return string
	 */
	private static function rename_wrapper_class( string $html, string $slug ): string {
		$legacy_class = 'wp-block-' . str_replace( '/', '-', self::LEGACY_NAMESPACE ) . $slug;
		$tags         = new \WP_HTML_Tag_Processor( $html );

		if ( ! $tags->next_tag() || true !== $tags->has_class( $legacy_class ) ) {
			return $html;
		}

		$class = $tags->get_attribute( 'class' );
		if ( ! is_string( $class ) ) {
			return $html;
		}

		$tags->set_attribute(
			'class',
			(string) preg_replace(
				'/(?<=^|\s)' . preg_quote( $legacy_class, '/' ) . '(?=\s|$)/',
				'wp-block-' . str_replace( '/', '-', self::CURRENT_NAMESPACE ) . $slug,
				$class
			)
		);

		return $tags->get_updated_html();
	}
}
