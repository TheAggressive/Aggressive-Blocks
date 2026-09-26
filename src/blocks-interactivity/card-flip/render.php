<?php
/**
 * Card Flip Block — Server Render.
 *
 * Structure is guaranteed by the editor template (exactly one front and one
 * back face block), so there is no face-counting here — we just wrap the
 * InnerBlocks content and emit the flip control + Interactivity directives.
 *
 * The flip is a button-driven disclosure: the button toggles `context.isFlipped`,
 * CSS performs the 3D flip, and view.ts marks the away-facing side `inert` so it
 * leaves the tab order / accessibility tree. The back face is rendered `inert`
 * here too, so it is never focusable before the store hydrates. The hover
 * variant drives the same state from a mouse pointer; the button keeps it
 * reachable by keyboard, touch and reduced-motion, and Escape turns it back.
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    InnerBlocks HTML (front + back face blocks).
 * @var WP_Block $block      Block instance.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$allowed_flip_on = array( 'hover', 'click' );
$flip_on         = isset( $attributes['flipOn'] ) ? (string) $attributes['flipOn'] : 'hover';
$flip_on         = in_array( $flip_on, $allowed_flip_on, true ) ? $flip_on : 'hover';

$wrapper_extra = array(
	'class'                     => 'aa-card-flip aa-card-flip--' . sanitize_html_class( $flip_on ),
	'data-wp-interactive'       => 'aggressive-blocks/card-flip',
	'data-wp-context'           => (string) wp_json_encode(
		array(
			'isFlipped' => false,
			'flipOn'    => $flip_on,
		)
	),
	'data-wp-class--is-flipped' => 'context.isFlipped',
	'data-wp-watch--faces'      => 'callbacks.syncFaces',
	'data-wp-on--keydown'       => 'actions.keydown',
);

if ( 'hover' === $flip_on ) {
	$wrapper_extra['data-wp-on--pointerenter'] = 'actions.pointerEnter';
	$wrapper_extra['data-wp-on--pointerleave'] = 'actions.pointerLeave';
}

/**
 * Render the back face `inert`, matching the store's unflipped state.
 *
 * Only a top-level face counts, so a card nested in a face is left to its own
 * render. Content the HTML API cannot parse is returned unchanged; the store
 * marks the face once it hydrates.
 *
 * @param string $html Inner block content (front + back face blocks).
 * @return string
 */
$inert_back_face = static function ( string $html ): string {
	$processor = \WP_HTML_Processor::create_fragment( $html );
	if ( null === $processor ) {
		return $html;
	}
	$top = null;
	while ( $processor->next_tag() ) {
		$top = $top ?? $processor->get_current_depth();
		if ( $processor->get_current_depth() === $top && $processor->has_class( 'aa-card-flip__face--back' ) ) {
			$processor->set_attribute( 'inert', true );
			break;
		}
	}
	return null === $processor->get_last_error() ? $processor->get_updated_html() : $html;
};

$flip_icon = aggressive_blocks_get_icon(
	'returns-arrows',
	array(
		'width'       => 18,
		'height'      => 18,
		'aria-hidden' => 'true',
		'focusable'   => 'false',
	)
);
?>
<div <?php echo aggressive_blocks_get_block_wrapper_attributes( $wrapper_extra ); ?>>
	<button
		type="button"
		class="aa-card-flip__toggle aa-icon-button aa-icon-button--only"
		aria-pressed="false"
		aria-label="<?php esc_attr_e( 'Flip card', 'aggressive-blocks' ); ?>"
		data-wp-on--click="actions.toggle"
		data-wp-bind--aria-pressed="context.isFlipped"
	>
		<?php echo aggressive_blocks_trusted_html( $flip_icon ); ?>
	</button>
	<div class="aa-card-flip__inner">
		<?php echo aggressive_blocks_trusted_html( $inert_back_face( $content ) ); ?>
	</div>
</div>
