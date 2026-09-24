<?php
/**
 * Temporary old-name aliases for unmigrated stored content.
 *
 * Remove this class after every environment has run
 * `wp aggressive-blocks migrate-blocks` and committed templates use
 * aggressive-blocks/* names. See readme.txt.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Blocks;

/**
 * Registers inserter-hidden aliases for aggressive-apparel/* names.
 */
class Aliases {

	/**
	 * Slugs that moved from aggressive-apparel to aggressive-blocks.
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
	 * Hook alias registration after canonical blocks.
	 *
	 * @return void
	 */
	public static function init(): void {
		add_action( 'init', array( self::class, 'register' ), 20 );
	}

	/**
	 * Register old names only when the theme no longer owns them.
	 *
	 * @return void
	 */
	public static function register(): void {
		$registry = \WP_Block_Type_Registry::get_instance();

		foreach ( self::SLUGS as $slug ) {
			$canonical_name = Blocks::BLOCK_NAMESPACE . $slug;
			$legacy_name    = 'aggressive-apparel/' . $slug;

			if ( $registry->is_registered( $legacy_name ) ) {
				continue;
			}

			$canonical = $registry->get_registered( $canonical_name );
			if ( ! $canonical instanceof \WP_Block_Type ) {
				continue;
			}

			$args = array(
				'api_version'           => (string) $canonical->api_version,
				'title'                 => $canonical->title,
				'category'              => $canonical->category,
				'parent'                => self::legacy_related( $canonical->parent ),
				'ancestor'              => self::legacy_related( $canonical->ancestor ),
				'allowed_blocks'        => self::legacy_related( $canonical->allowed_blocks ),
				'icon'                  => $canonical->icon,
				'description'           => $canonical->description,
				'keywords'              => $canonical->keywords,
				'textdomain'            => $canonical->textdomain,
				'styles'                => $canonical->styles,
				'supports'              => self::with_inserter_disabled( $canonical->supports ),
				'provides_context'      => $canonical->provides_context,
				'uses_context'          => is_array( $canonical->uses_context ) ? $canonical->uses_context : array(),
				'selectors'             => $canonical->selectors,
				'attributes'            => $canonical->attributes,
				'render_callback'       => $canonical->render_callback,
				'skip_inner_blocks'     => (bool) $canonical->skip_inner_blocks,
				'editor_script_handles' => $canonical->editor_script_handles,
				'script_handles'        => $canonical->script_handles,
				'view_script_handles'   => $canonical->view_script_handles,
				'style_handles'         => $canonical->style_handles,
				'editor_style_handles'  => $canonical->editor_style_handles,
				'view_style_handles'    => $canonical->view_style_handles,
			);

			if ( is_array( $canonical->view_script_module_ids ) && array() !== $canonical->view_script_module_ids ) {
				$args['view_script_module_ids'] = $canonical->view_script_module_ids;
			}

			try {
				register_block_type( $legacy_name, $args );
			} catch ( \Throwable $e ) {
				unset( $e );
			}
		}
	}

	/**
	 * Disable inserter on alias supports.
	 *
	 * @param array<string, mixed>|null $supports Canonical supports.
	 * @return array<string, mixed>
	 */
	private static function with_inserter_disabled( $supports ): array {
		$supports             = is_array( $supports ) ? $supports : array();
		$supports['inserter'] = false;
		return $supports;
	}

	/**
	 * Rewrite related block names to the legacy namespace when needed.
	 *
	 * @param array<int, string>|string|null $related Related names.
	 * @return array<int, string>|string|null
	 */
	private static function legacy_related( $related ) {
		if ( is_string( $related ) ) {
			return str_replace( 'aggressive-blocks/', 'aggressive-apparel/', $related );
		}

		if ( ! is_array( $related ) ) {
			return $related;
		}

		return array_map(
			static function ( $name ) {
				return is_string( $name )
					? str_replace( 'aggressive-blocks/', 'aggressive-apparel/', $name )
					: $name;
			},
			$related
		);
	}
}
