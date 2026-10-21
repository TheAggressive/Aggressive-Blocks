<?php
/**
 * Server-side registration of the per-block parallax attribute.
 *
 * The editor (src/blocks-interactivity/parallax/attributes.ts) adds `aggressiveApparelParallax`
 * to every block type. Blocks the editor previews through the
 * server (ServerSideRender → /wp/v2/block-renderer: core Archives, Calendar,
 * Tag Cloud, plugin blocks such as Fluent Forms) send their attributes to that
 * endpoint, which rejects any attribute the server registry doesn't know —
 * the preview shows "Invalid attribute: aggressiveApparelParallax is not a
 * valid property of Object". Registering it here keeps the two registries in
 * step.
 *
 * No default on purpose: the attribute only has to validate. Without one,
 * core never injects it into render callbacks, so blocks that don't use
 * parallax render exactly as before.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Blocks;

/**
 * Mirrors the editor's global parallax attribute in the server block registry.
 */
class Parallax_Attributes {

	/**
	 * Attribute name, as in attributes.ts.
	 */
	public const ATTRIBUTE = 'aggressiveApparelParallax';

	/**
	 * The parallax container itself never carries the per-block attribute.
	 */
	private const OWN_BLOCK = 'aggressive-blocks/parallax';

	/**
	 * Hook the registry filter. Must run before `init`, when blocks register.
	 *
	 * @return void
	 */
	public static function init(): void {
		add_filter( 'register_block_type_args', array( self::class, 'add_attribute' ), 10, 2 );
	}

	/**
	 * Add the attribute schema to a block type's registration args.
	 *
	 * @param array<string, mixed> $args Block type args.
	 * @param string               $name Block type name.
	 * @return array<string, mixed>
	 */
	public static function add_attribute( array $args, string $name ): array {
		if ( self::OWN_BLOCK === $name ) {
			return $args;
		}

		$attributes = isset( $args['attributes'] ) && is_array( $args['attributes'] ) ? $args['attributes'] : array();

		if ( ! isset( $attributes[ self::ATTRIBUTE ] ) ) {
			$attributes[ self::ATTRIBUTE ] = array( 'type' => 'object' );
		}

		$args['attributes'] = $attributes;

		return $args;
	}
}
