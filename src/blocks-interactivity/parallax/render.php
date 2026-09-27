<?php
/**
 * Advanced Parallax Container Block
 *
 * Full implementation featuring:
 * - Intersection Observer integration
 * - Container for nested blocks with individual parallax controls
 * - Advanced parallax effects with customizable settings
 * The following variables are exposed to this file:
 * $attributes (array) : The block attributes .
 * $content (string) : The block default content .
 * $block( WP_Block ): The block instance .
 *
 * @see https://github.com/WordPress/gutenberg/blob/trunk/docs/reference-guides/block-api/block-metadata.md#render
 *
 * @var array<string, mixed> $attributes Block attributes.
 * @var string               $content    Block default content.
 * @var WP_Block             $block      Block instance.
 *
 * @package Aggressive_Blocks
 */

defined( 'ABSPATH' ) || exit;

// Saved attributes are untrusted input: coerce numbers, whitelist enums,
// and accept only px/% boundary sides (anything else would desync the
// JS engine and the view-timeline inset, which parse the same format).
$parallax_number = static function ( $value, float $fallback ): float {
	return is_numeric( $value ) ? (float) $value : $fallback;
};

$parallax_boundary_side = static function ( $value ): string {
	return is_string( $value ) && preg_match( '/^-?\d+(\.\d+)?(px|%)$/', trim( $value ) )
		? trim( $value )
		: '0%';
};

$raw_boundary       = is_array( $attributes['detectionBoundary'] ?? null ) ? $attributes['detectionBoundary'] : array();
$detection_boundary = array();
foreach ( array( 'top', 'right', 'bottom', 'left' ) as $parallax_side ) {
	$detection_boundary[ $parallax_side ] = $parallax_boundary_side( $raw_boundary[ $parallax_side ] ?? '0%' );
}

$parallax_directions = array( 'up', 'down', 'left', 'right', 'both', 'none' );
$parallax_direction  = in_array( $attributes['parallaxDirection'] ?? 'down', $parallax_directions, true )
	? $attributes['parallaxDirection'] ?? 'down'
	: 'down';

$enable_mouse_interaction = ! empty( $attributes['enableMouseInteraction'] );
$disable_on_mobile        = ! empty( $attributes['disableOnMobile'] );
$perspective_distance     = max( 1.0, $parallax_number( $attributes['perspectiveDistance'] ?? null, 1000 ) );

// Debug Mode is a saved attribute: gate it per-request so visitors
// without editing capabilities never see overlays or download the
// debug script chunk, even on a page saved with it enabled.
$debug_mode = ! empty( $attributes['debugMode'] )
	&& aggressive_blocks_can_view_block_debug();

$parallax_instance_id = wp_unique_id( 'parallax_' );

$context = array(
	'id'                       => $parallax_instance_id,
	'intensity'                => $parallax_number( $attributes['intensity'] ?? null, 50 ),
	'visibilityTrigger'        => min( 1.0, max( 0.0, $parallax_number( $attributes['visibilityTrigger'] ?? null, 0.3 ) ) ),
	'detectionBoundary'        => $detection_boundary,
	'activationBuffer'         => max( 0.0, $parallax_number( $attributes['activationBuffer'] ?? null, 20 ) ),
	'enableMouseInteraction'   => $enable_mouse_interaction,
	'disableOnMobile'          => $disable_on_mobile,
	'debugMode'                => $debug_mode,
	'parallaxDirection'        => $parallax_direction,
	'mouseInfluenceMultiplier' => $parallax_number( $attributes['mouseInfluenceMultiplier'] ?? null, 0.5 ),
	'maxMouseTranslation'      => $parallax_number( $attributes['maxMouseTranslation'] ?? null, 20 ),
	'depthIntensityMultiplier' => $parallax_number( $attributes['depthIntensityMultiplier'] ?? null, 50 ),
	'transitionDuration'       => max( 0.0, $parallax_number( $attributes['transitionDuration'] ?? null, 0.1 ) ),
	'perspectiveDistance'      => $perspective_distance,
	'maxMouseRotation'         => $parallax_number( $attributes['maxMouseRotation'] ?? null, 5 ),
	'depthOfField'             => ! empty( $attributes['depthOfField'] ),
	'isIntersecting'           => false,
	'intersectionRatio'        => 0,
	'hasInitialized'           => false,
	'previousProgress'         => 0,
);

$classes = array(
	'wp-block-aggressive-apparel-parallax',
	'aggressive-apparel-parallax',
	'aggressive-apparel-parallax--direction-' . $parallax_direction,
);

if ( $enable_mouse_interaction ) {
	$classes[] = 'aggressive-apparel-parallax--mouse-interaction';
}

if ( $disable_on_mobile ) {
	$classes[] = 'aggressive-apparel-parallax--disable-on-mobile';
}

if ( $debug_mode ) {
	$classes[] = 'aggressive-apparel-parallax--debug';

	// Debug-only stylesheet + translated strings blob; kept out of the
	// block's own assets so production visitors never download them.
	aggressive_blocks_enqueue_block_debug_assets();
}

// Intersecting/initialized classes are toggled imperatively by the
// shared frame engine, so no reactive class bindings are needed here.
$wrapper_attributes = aggressive_blocks_get_block_wrapper_attributes(
	array(
		'class'               => implode( ' ', $classes ),
		'data-wp-interactive' => 'aggressive-blocks/parallax',
		'data-wp-context'     => (string) wp_json_encode( $context ),
		'data-wp-init'        => 'callbacks.initParallax',
		'data-instance-id'    => $parallax_instance_id,
		'style'               => '--parallax-perspective: ' . $perspective_distance . 'px;',
	)
);

// Markup matches the editor canvas (container → content). $content is
// the inner blocks as core already rendered them — running it through
// kses here stripped forms, inputs, SVG icons and embeds from anything
// nested in the block.
?>
<div <?php echo aggressive_blocks_trusted_html( $wrapper_attributes ); ?>>
	<div class="aggressive-apparel-parallax__container">
		<div class="aggressive-apparel-parallax__content"><?php echo aggressive_blocks_trusted_html( $content ); ?></div>
	</div>
</div>
