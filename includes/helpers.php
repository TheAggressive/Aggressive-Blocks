<?php
/**
 * Shared plugin helpers used by migrated block render.php files.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Get trusted plugin SVG icon markup.
 *
 * @param string               $icon  Icon name.
 * @param array<string, mixed> $attrs Optional SVG attributes.
 * @return string SVG markup or empty string if icon not found.
 */
function aggressive_blocks_get_icon( string $icon, array $attrs = array() ): string {
	return \Aggressive_Blocks\Core\Icons::get( $icon, $attrs );
}

/**
 * Echo a trusted plugin SVG icon.
 *
 * @param string               $icon  Icon name.
 * @param array<string, mixed> $attrs Optional SVG attributes.
 * @return void
 */
function aggressive_blocks_render_icon( string $icon, array $attrs = array() ): void {
	echo aggressive_blocks_get_icon( $icon, $attrs ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}

/**
 * Mark HTML as trusted for escaped output (PHPCS EscapeOutput).
 *
 * @param string $html Already-escaped or otherwise trusted HTML.
 * @return string Same HTML.
 */
function aggressive_blocks_trusted_html( string $html ): string {
	return $html;
}

/**
 * Normalize extra attributes for get_block_wrapper_attributes().
 *
 * WordPress accepts false to omit an attribute at runtime; the stubs type the
 * parameter as array<string, string> only.
 *
 * @param array<string, mixed> $extra Extra wrapper attributes.
 * @return string
 */
function aggressive_blocks_get_block_wrapper_attributes( array $extra = array() ): string {
	$normalized = array();

	foreach ( $extra as $name => $value ) {
		if ( false === $value || null === $value ) {
			continue;
		}

		$normalized[ (string) $name ] = is_scalar( $value ) ? (string) $value : '';
	}

	return get_block_wrapper_attributes( $normalized );
}

/**
 * Whether the current visitor may see block debug tooling.
 *
 * Applies the same filter the theme used so existing site code continues
 * to gate Animate On Scroll / Parallax debug overlays.
 *
 * @return bool
 */
function aggressive_blocks_can_view_block_debug(): bool {
	/**
	 * Filters who may see front-end block debug tooling.
	 *
	 * @param bool $can_view Defaults to current_user_can( 'edit_posts' ).
	 */
	return (bool) apply_filters(
		'aggressive_apparel_can_view_block_debug',
		current_user_can( 'edit_posts' )
	);
}

/**
 * Translated strings for the front-end block debug tooling.
 *
 * Keys MUST mirror DEFAULT_STRINGS in src/blocks-interactivity/debug-shared/i18n.ts.
 *
 * @return array<string, string>
 */
function aggressive_blocks_block_debug_strings(): array {
	return array(
		'titleParallax'      => __( 'Parallax Debug', 'aggressive-blocks' ),
		'titleAos'           => __( 'Animate On Scroll Debug', 'aggressive-blocks' ),
		'panelCollapse'      => __( 'Collapse debug panel', 'aggressive-blocks' ),
		'panelExpand'        => __( 'Expand debug panel', 'aggressive-blocks' ),
		'sectionLive'        => __( 'Live state', 'aggressive-blocks' ),
		'sectionDetails'     => __( 'Details', 'aggressive-blocks' ),
		'legend'             => __( 'Legend', 'aggressive-blocks' ),
		'rowState'           => __( 'State', 'aggressive-blocks' ),
		'rowVisibility'      => __( 'Visibility', 'aggressive-blocks' ),
		'rowProgress'        => __( 'Progress', 'aggressive-blocks' ),
		'rowDirection'       => __( 'Scroll direction', 'aggressive-blocks' ),
		'rowThreshold'       => __( 'Threshold', 'aggressive-blocks' ),
		'rowFramerate'       => __( 'Frame rate', 'aggressive-blocks' ),
		'rowSize'            => __( 'Element size', 'aggressive-blocks' ),
		'rowBoundary'        => __( 'Boundary', 'aggressive-blocks' ),
		'rowObserver'        => __( 'Observer', 'aggressive-blocks' ),
		'phaseWaiting'       => __( 'Waiting', 'aggressive-blocks' ),
		'phaseApproaching'   => __( 'Approaching', 'aggressive-blocks' ),
		'phaseActive'        => __( 'Active', 'aggressive-blocks' ),
		'engineLabel'        => __( 'Engine', 'aggressive-blocks' ),
		'engineActive'       => __( 'Active', 'aggressive-blocks' ),
		'engineIdle'         => __( 'Idle', 'aggressive-blocks' ),
		'animationLabel'     => __( 'Animation', 'aggressive-blocks' ),
		'animationShown'     => __( 'Shown', 'aggressive-blocks' ),
		'animationHidden'    => __( 'Hidden', 'aggressive-blocks' ),
		'reverseLabel'       => __( 'Reverse on scroll back', 'aggressive-blocks' ),
		'yes'                => __( 'Yes', 'aggressive-blocks' ),
		'no'                 => __( 'No', 'aggressive-blocks' ),
		'directionDown'      => __( '↓ Down', 'aggressive-blocks' ),
		'directionUp'        => __( '↑ Up', 'aggressive-blocks' ),
		'measuring'          => __( '— measuring…', 'aggressive-blocks' ),
		/* translators: {pct} is replaced with a percentage number. */
		'thresholdEntry'     => __( '{pct}% entry', 'aggressive-blocks' ),
		/* translators: {entry} and {exit} are replaced with percentage numbers. */
		'thresholdEntryExit' => __( '{entry}% entry · {exit}% exit', 'aggressive-blocks' ),
		'boundaryConfigured' => __( 'Detection boundary', 'aggressive-blocks' ),
		'boundaryEffective'  => __( 'Observer boundary (incl. engine buffer)', 'aggressive-blocks' ),
		'boundaryExtends'    => __( '· extends beyond viewport', 'aggressive-blocks' ),
		/* translators: {pct} is replaced with a percentage number. */
		'lineEntryBottom'    => __( 'Entry (bottom) {pct}%', 'aggressive-blocks' ),
		/* translators: {pct} is replaced with a percentage number. */
		'lineEntryTop'       => __( 'Entry (top) {pct}%', 'aggressive-blocks' ),
		/* translators: {pct} is replaced with a percentage number. */
		'lineExit'           => __( 'Exit ≤ {pct}%', 'aggressive-blocks' ),
		'legendBoundary'     => __( 'Detection boundary — area the observer watches (viewport ± your margins)', 'aggressive-blocks' ),
		'legendEffective'    => __( 'Observer boundary — detection boundary plus the engine’s pre-activation buffer', 'aggressive-blocks' ),
		'legendElement'      => __( 'This block’s element — outlined even while its content is hidden', 'aggressive-blocks' ),
		/* translators: {pct} is replaced with a percentage number. */
		'legendEntry'        => __( 'Entry line — triggers at {pct}% visible when scrolling down', 'aggressive-blocks' ),
		/* translators: {pct} is replaced with a percentage number. */
		'legendEntryTop'     => __( 'Entry line for scrolling up (same {pct}%, measured from the bottom)', 'aggressive-blocks' ),
		/* translators: {pct} is replaced with a percentage number. */
		'legendExit'         => __( 'Exit line — reverses once visibility falls below {pct}%', 'aggressive-blocks' ),
		'legendZone'         => __( 'Entry zone — tinted band the boundary edge must reach to trigger', 'aggressive-blocks' ),
		/* translators: Four brace-delimited placeholders are replaced with measurements. */
		'warnUnreachable'    => __( 'Entry threshold {pct}% is unreachable: the element ({elem}px) is taller than the detection area ({root}px). Max visibility ≈ {max}%.', 'aggressive-blocks' ),
	);
}

/**
 * Enqueue front-end block debug tooling from the plugin build.
 *
 * @return void
 */
function aggressive_blocks_enqueue_block_debug_assets(): void {
	$style = AGGRESSIVE_BLOCKS_DIR . 'build/styles/debug-overlays.css';
	if ( is_readable( $style ) ) {
		wp_enqueue_style(
			'aggressive-blocks-debug-overlays',
			AGGRESSIVE_BLOCKS_URI . 'build/styles/debug-overlays.css',
			array(),
			(string) filemtime( $style )
		);
	}

	static $strings_hooked = false;
	if ( $strings_hooked ) {
		return;
	}
	$strings_hooked = true;

	add_action(
		'wp_footer',
		static function (): void {
			printf(
				'<script type="application/json" id="aa-dbg-i18n">%s</script>',
				wp_json_encode(
					aggressive_blocks_block_debug_strings(),
					JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE
				)
			);
		}
	);
}
