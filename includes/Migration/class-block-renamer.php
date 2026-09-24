<?php
/**
 * Parse-and-serialize block namespace migrator.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Migration;

use Aggressive_Blocks\Blocks\Aliases;

/**
 * Renames aggressive-apparel/* comments to aggressive-blocks/* via parse_blocks().
 */
class Block_Renamer {

	/**
	 * Candidate LIKE fragment.
	 */
	public const CANDIDATE_LIKE = '%<!-- wp:aggressive-apparel/%';

	/**
	 * Rewrite serialized block markup.
	 *
	 * @param string $content Post content.
	 * @return array{content: string, changed: bool, count: int}
	 */
	public static function rewrite( string $content ): array {
		if ( ! str_contains( $content, '<!-- wp:aggressive-apparel/' ) ) {
			return array(
				'content' => $content,
				'changed' => false,
				'count'   => 0,
			);
		}

		$blocks = parse_blocks( $content );
		$count  = 0;
		$next   = self::rewrite_blocks( is_array( $blocks ) ? $blocks : array(), $count );

		if ( 0 === $count ) {
			return array(
				'content' => $content,
				'changed' => false,
				'count'   => 0,
			);
		}

		return array(
			'content' => serialize_blocks( $next ),
			'changed' => true,
			'count'   => $count,
		);
	}

	/**
	 * Recursively rename mapped blocks.
	 *
	 * @param array<int|string, mixed> $blocks Parsed blocks from parse_blocks().
	 * @param int                      $count  Renamed block counter.
	 * @return array<int|string, mixed>
	 */
	private static function rewrite_blocks( array $blocks, int &$count ): array {
		foreach ( $blocks as $index => $block ) {
			$name = isset( $block['blockName'] ) && is_string( $block['blockName'] )
				? $block['blockName']
				: '';

			if ( '' !== $name && str_starts_with( $name, 'aggressive-apparel/' ) ) {
				$slug = substr( $name, strlen( 'aggressive-apparel/' ) );
				if ( in_array( $slug, Aliases::SLUGS, true ) ) {
					$blocks[ $index ]['blockName'] = 'aggressive-blocks/' . $slug;
					++$count;
				}
			}

			if ( ! empty( $block['innerBlocks'] ) && is_array( $block['innerBlocks'] ) ) {
				$blocks[ $index ]['innerBlocks'] = self::rewrite_blocks( $block['innerBlocks'], $count );
			}
		}

		return $blocks;
	}
}
