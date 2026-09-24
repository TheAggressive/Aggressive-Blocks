<?php
/**
 * Block category registration.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Core;

/**
 * Registers the historical Aggressive Apparel category slug so inserter
 * grouping does not move. The title is plugin-owned when the theme has
 * not already registered the category.
 */
class Block_Categories {

	/**
	 * Historical category slug used by migrated block.json files.
	 */
	public const SLUG = 'aggressive-apparel';

	/**
	 * Hook the category filter.
	 *
	 * @return void
	 */
	public static function init(): void {
		add_filter( 'block_categories_all', array( self::class, 'register_block_categories' ), 10, 2 );
	}

	/**
	 * Add the category when it is not already present.
	 *
	 * @param array<int, array<string, mixed>> $categories Existing categories.
	 * @param \WP_Block_Editor_Context         $context    Editor context.
	 * @return array<int, array<string, mixed>>
	 */
	public static function register_block_categories( array $categories, \WP_Block_Editor_Context $context ): array {
		unset( $context );

		foreach ( $categories as $category ) {
			if ( isset( $category['slug'] ) && self::SLUG === $category['slug'] ) {
				return $categories;
			}
		}

		array_unshift(
			$categories,
			array(
				'slug'  => self::SLUG,
				'title' => __( 'Aggressive Blocks', 'aggressive-blocks' ),
				'icon'  => null,
			)
		);

		return $categories;
	}
}
