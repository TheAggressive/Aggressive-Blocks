<?php
/**
 * PHP file to use when rendering the block type on the server to show on the front end.
 *
 * The following variables are exposed to this file:
 *     $attributes (array): The block attributes.
 *     $content    (string): The block default content.
 *     $block      (WP_Block): The block instance.
 *
 * @see https://github.com/WordPress/gutenberg/blob/trunk/docs/reference-guides/block-api/block-metadata.md#render
 *
 * @package Aggressive_Blocks
 */

defined( 'ABSPATH' ) || exit;

/**
 * WordPress-injected block attributes.
 *
 * @var array $attributes
 */

/**
 * WordPress-injected inner-blocks HTML.
 *
 * @var string $content
 */

$requested_id = isset( $attributes['modalId'] ) && is_string( $attributes['modalId'] )
	? sanitize_html_class( $attributes['modalId'] )
	: '';
$unique_id    = '' !== $requested_id ? $requested_id : 'modal-' . wp_unique_id();

/**
 * Restrict class-generating attributes to values supported by this block.
 *
 * @param mixed         $value   Candidate attribute value.
 * @param array<string> $allowed Supported values.
 * @param string        $fallback Fallback value.
 * @return string
 */
$sanitize_choice = static function ( $value, array $allowed, string $fallback ): string {
	return is_string( $value ) && in_array( $value, $allowed, true ) ? $value : $fallback;
};

/**
 * Keep user-controlled values inside a single CSS declaration value.
 *
 * Block attributes are stored in post content and can be edited outside the
 * block UI, so sanitize_text_field() alone is not sufficient for inline CSS.
 *
 * @param mixed $value Candidate CSS value.
 * @return string
 */
$sanitize_css_value = static function ( $value ): string {
	if ( ! is_string( $value ) && ! is_int( $value ) && ! is_float( $value ) ) {
		return '';
	}

	$value = sanitize_text_field( (string) $value );
	if ( preg_match( '/[;{}]/', $value ) || preg_match( '/(?:expression|url)\s*\(/i', $value ) ) {
		return '';
	}

	return $value;
};

$position                = $sanitize_choice(
	$attributes['position'] ?? 'center',
	array( 'center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'bottom', 'top', 'left', 'right' ),
	'center'
);
$open_on_load            = ! empty( $attributes['openOnLoad'] );
$open_on_load_once       = ! empty( $attributes['openOnLoadOnce'] );
$disable_overlay         = ! empty( $attributes['disableOverlay'] );
$trigger_block_id        = isset( $attributes['triggerBlockId'] ) && is_string( $attributes['triggerBlockId'] ) ? trim( $attributes['triggerBlockId'] ) : '';
$trigger_label           = isset( $attributes['triggerLabel'] ) && is_string( $attributes['triggerLabel'] )
	? trim( sanitize_text_field( $attributes['triggerLabel'] ) )
	: '';
$trigger_label           = '' !== $trigger_label ? $trigger_label : __( 'Open Modal', 'aggressive-blocks' );
$enter_animation         = $sanitize_choice(
	$attributes['enterAnimation'] ?? 'fade',
	array( 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'expand', 'recede', 'lift', 'spring', 'pop', 'warp', 'material', 'float', 'drift', 'flip-up', 'blur', 'none' ),
	'fade'
);
$exit_animation          = $sanitize_choice(
	$attributes['exitAnimation'] ?? 'fade',
	array( 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-out', 'zoom-in', 'expand', 'recede', 'pop', 'flip-down', 'blur', 'none' ),
	'fade'
);
$animation_duration      = min( 1000, max( 100, absint( $attributes['animationDuration'] ?? 300 ) ) );
$exit_intent_trigger     = ! empty( $attributes['exitIntentTrigger'] );
$exit_intent_reshow_days = min( 90, max( 1, absint( $attributes['exitIntentReshowDays'] ?? 7 ) ) );
$scroll_depth_trigger    = ! empty( $attributes['scrollDepthTrigger'] );
$scroll_depth_percent    = min( 100, max( 10, absint( $attributes['scrollDepthPercent'] ?? 50 ) ) );
$show_builtin_trigger    = ! $open_on_load
	&& empty( $trigger_block_id )
	&& ! $exit_intent_trigger
	&& ! $scroll_depth_trigger;
$dialog_max_width        = $sanitize_css_value( $attributes['dialogMaxWidth'] ?? '' );

// ── Close button attributes ───────────────────────────────────────────────────

$close_placement      = $sanitize_choice( $attributes['closeButtonPlacement'] ?? 'inside-top-right', array( 'inside-top-right', 'inside-top-left', 'inside-bottom-right', 'inside-bottom-left', 'sticky-top-right', 'outside-top-right', 'outside-top-left', 'none' ), 'inside-top-right' );
$close_icon           = $sanitize_choice( $attributes['closeButtonIcon'] ?? 'close', array( 'close', 'arrow-left', 'chevron-down', 'text-only' ), 'close' );
$close_size           = $sanitize_choice( $attributes['closeButtonSize'] ?? 'md', array( 'sm', 'md', 'lg' ), 'md' );
$close_variant        = $sanitize_choice( $attributes['closeButtonVariant'] ?? 'ghost', array( 'ghost', 'filled', 'outlined' ), 'ghost' );
$close_label          = isset( $attributes['closeButtonLabel'] ) && is_string( $attributes['closeButtonLabel'] ) ? sanitize_text_field( $attributes['closeButtonLabel'] ) : '';
$close_color          = $sanitize_css_value( $attributes['closeButtonColor'] ?? '' );
$close_bg_color       = $sanitize_css_value( $attributes['closeButtonBgColor'] ?? '' );
$close_hover_color    = $sanitize_css_value( $attributes['closeButtonHoverColor'] ?? '' );
$close_hover_bg_color = $sanitize_css_value( $attributes['closeButtonHoverBgColor'] ?? '' );

// Without a backdrop to click, a hidden close button leaves pointer and touch
// users with no way out of the dialog. Keep the default button in that case.
if ( 'none' === $close_placement && $disable_overlay ) {
	$close_placement = 'inside-top-right';
}

$show_close_btn = 'none' !== $close_placement;
$is_outside     = str_starts_with( $close_placement, 'outside-' );

// ── Trigger button attributes ─────────────────────────────────────────────────

$trigger_variant       = $sanitize_choice( $attributes['triggerVariant'] ?? 'outlined', array( 'outlined', 'filled', 'ghost', 'text' ), 'outlined' );
$trigger_size          = $sanitize_choice( $attributes['triggerSize'] ?? 'md', array( 'sm', 'md', 'lg' ), 'md' );
$trigger_full_width    = ! empty( $attributes['triggerFullWidth'] );
$trigger_border_radius = $sanitize_css_value( $attributes['triggerBorderRadius'] ?? '' );
$trigger_bg_color      = $sanitize_css_value( $attributes['triggerBgColor'] ?? '' );
$trigger_text_color    = $sanitize_css_value( $attributes['triggerTextColor'] ?? '' );
$trigger_hover_bg      = $sanitize_css_value( $attributes['triggerHoverBgColor'] ?? '' );
$trigger_hover_text    = $sanitize_css_value( $attributes['triggerHoverTextColor'] ?? '' );

// ── Dialog design attributes ──────────────────────────────────────────────────

$overlay_opacity = min( 90, absint( $attributes['overlayOpacity'] ?? 50 ) );
$overlay_blur    = min( 20, absint( $attributes['overlayBlur'] ?? 4 ) );
$overlay_color   = $sanitize_css_value( $attributes['overlayColor'] ?? '' );

// ── Block supports, applied to the dialog panel only ─────────────────────────
// block.json skips serialization for color, border, padding, and shadow, so
// neither the saved markup nor get_block_wrapper_attributes() carries them.
// The style engine resolves presets, per-side and per-corner values, and runs
// the result through safecss_filter_attr().

$style_attr    = isset( $attributes['style'] ) && is_array( $attributes['style'] ) ? $attributes['style'] : array();
$support_style = array_intersect_key(
	$style_attr,
	array(
		'color'  => true,
		'border' => true,
		'shadow' => true,
	)
);
if ( isset( $style_attr['spacing']['padding'] ) ) {
	$support_style['spacing'] = array( 'padding' => $style_attr['spacing']['padding'] );
}

// Palette picks are stored as slugs. Resolve them to their custom properties so
// the style engine emits declarations, not has-*-color classes.
$preset_colors = array(
	'backgroundColor' => array( 'color', 'background' ),
	'textColor'       => array( 'color', 'text' ),
	'borderColor'     => array( 'border', 'color' ),
);
foreach ( $preset_colors as $preset_attribute => $style_path ) {
	$slug = $attributes[ $preset_attribute ] ?? '';
	if ( is_string( $slug ) && '' !== $slug ) {
		$support_style[ $style_path[0] ][ $style_path[1] ] = 'var(--wp--preset--color--' . _wp_to_kebab_case( $slug ) . ')';
	}
}

// Posts saved before the v3 deprecation still carry the retired design
// attributes. They styled the dialog before, so they still win.
$legacy_padding = $sanitize_css_value( $attributes['dialogPadding'] ?? '' );
if ( '' !== $legacy_padding ) {
	$support_style['spacing']['padding'] = $legacy_padding;
}
$legacy_radius = $sanitize_css_value( $attributes['dialogBorderRadius'] ?? '' );
if ( '' !== $legacy_radius ) {
	$support_style['border']['radius'] = $legacy_radius;
}

$support_css = wp_style_engine_get_styles( $support_style )['css'] ?? '';

// The sticky close button paints the dialog background behind itself.
$dialog_background = $sanitize_css_value( $support_style['color']['background'] ?? '' );
if ( str_starts_with( $dialog_background, 'var:preset|color|' ) ) {
	$dialog_background = 'var(--wp--preset--color--' . _wp_to_kebab_case( substr( $dialog_background, strlen( 'var:preset|color|' ) ) ) . ')';
}

// Posts saved before the v3 deprecation wrap the inner blocks in a copy of the
// block wrapper, block-support classes and styles included. Unwrap it so the
// dialog body is not styled a second time. v1 also saved a close button.
if ( preg_match( '#^\s*<div\s[^>]*class="wp-block-aggressive-blocks-modal[\s"][^>]*>(.*)</div>\s*$#s', $content, $legacy_wrapper ) ) {
	$content = (string) preg_replace(
		'#^\s*<button[^>]*class="wp-block-aggressive-apparel-modal__close"[^>]*>.*?</button>#s',
		'',
		$legacy_wrapper[1],
		1
	);
}

// ── Accessible name ───────────────────────────────────────────────────────────
// An explicit dialog label wins. Otherwise the first heading in the content
// names the dialog, skipping headings inside a nested modal. Without either,
// the built-in trigger's label says what was opened.

$dialog_label      = isset( $attributes['dialogLabel'] ) && is_string( $attributes['dialogLabel'] )
	? trim( sanitize_text_field( $attributes['dialogLabel'] ) )
	: '';
$dialog_heading_id = '';

if ( '' === $dialog_label ) {
	$headings      = new WP_HTML_Tag_Processor( $content );
	$nested_depth  = 0;
	$heading_names = array( 'H1', 'H2', 'H3', 'H4', 'H5', 'H6' );

	while ( $headings->next_tag( array( 'tag_closers' => 'visit' ) ) ) {
		$heading_tag = $headings->get_tag();
		if ( 'DIALOG' === $heading_tag ) {
			$nested_depth += $headings->is_tag_closer() ? -1 : 1;
			continue;
		}
		if ( $nested_depth > 0 || $headings->is_tag_closer() || ! in_array( $heading_tag, $heading_names, true ) ) {
			continue;
		}

		$heading_id = $headings->get_attribute( 'id' );
		if ( ! is_string( $heading_id ) || '' === trim( $heading_id ) ) {
			$heading_id = $unique_id . '-title';
			$headings->set_attribute( 'id', $heading_id );
			$content = $headings->get_updated_html();
		}
		$dialog_heading_id = $heading_id;
		break;
	}

	if ( '' === $dialog_heading_id ) {
		$dialog_label = $show_builtin_trigger ? $trigger_label : __( 'Dialog', 'aggressive-blocks' );
	}
}

// Build close button HTML when needed.
$close_btn_html = '';
if ( $show_close_btn ) {
	// Inline CSS custom properties for colors.
	$css_vars = array();
	if ( $close_color ) {
		$css_vars[] = '--aa-close-btn-color: ' . esc_attr( $close_color );
	}
	if ( $close_bg_color ) {
		$css_vars[] = '--aa-close-btn-bg: ' . esc_attr( $close_bg_color );
	}
	if ( $close_hover_color ) {
		$css_vars[] = '--aa-close-btn-hover-color: ' . esc_attr( $close_hover_color );
	}
	if ( $close_hover_bg_color ) {
		$css_vars[] = '--aa-close-btn-hover-bg: ' . esc_attr( $close_hover_bg_color );
	}

	$btn_style = $css_vars ? ' style="' . implode( '; ', $css_vars ) . '"' : '';

	$btn_classes = implode(
		' ',
		array(
			'wp-block-aggressive-apparel-modal__close aa-icon-button aa-icon-button--square',
			'close-size-' . $close_size,
			'close-variant-' . $close_variant,
			'close-placement-' . $close_placement,
		)
	);

	// Icon SVG — all options map to theme icon slugs.
	$icon_sizes = array(
		'sm' => 16,
		'md' => 20,
		'lg' => 24,
	);
	$icon_px    = $icon_sizes[ $close_size ] ?? 20;
	$icon_slugs = array(
		'close'        => 'close',
		'arrow-left'   => 'arrow-left',
		'chevron-down' => 'chevron-down',
	);
	$icon_svg   = '';
	if ( 'text-only' !== $close_icon ) {
		$slug     = $icon_slugs[ $close_icon ] ?? 'close';
		$icon_svg = aggressive_blocks_get_icon(
			$slug,
			array(
				'width'       => $icon_px,
				'height'      => $icon_px,
				'aria-hidden' => 'true',
			)
		);
	}

	// Visible label span (optional). When present, it supplies the accessible name.
	$label_html = $close_label
		? '<span class="wp-block-aggressive-apparel-modal__close-label">' . esc_html( $close_label ) . '</span>'
		: '';

	if ( $close_label ) {
		$close_btn_html = sprintf(
			'<button class="%s" type="button" data-wp-on--click="actions.closeModal"%s>%s%s</button>',
			esc_attr( $btn_classes ),
			aggressive_blocks_trusted_html( $btn_style ),
			$icon_svg,
			aggressive_blocks_trusted_html( $label_html )
		);
	} else {
		$close_btn_html = sprintf(
			'<button class="%s" type="button" data-wp-on--click="actions.closeModal" aria-label="%s"%s>%s</button>',
			esc_attr( $btn_classes ),
			esc_attr__( 'Close modal', 'aggressive-blocks' ),
			aggressive_blocks_trusted_html( $btn_style ),
			$icon_svg
		);
	}
}

// ── Trigger button inline style + classes ─────────────────────────────────────

$trigger_css_vars = array();
if ( $trigger_bg_color ) {
	$trigger_css_vars[] = '--aa-trigger-bg: ' . esc_attr( $trigger_bg_color );
}
if ( $trigger_text_color ) {
	$trigger_css_vars[] = '--aa-trigger-text: ' . esc_attr( $trigger_text_color );
}
if ( $trigger_hover_bg ) {
	$trigger_css_vars[] = '--aa-trigger-hover-bg: ' . esc_attr( $trigger_hover_bg );
}
if ( $trigger_hover_text ) {
	$trigger_css_vars[] = '--aa-trigger-hover-text: ' . esc_attr( $trigger_hover_text );
}
if ( $trigger_border_radius ) {
	$trigger_css_vars[] = '--aa-trigger-radius: ' . esc_attr( $trigger_border_radius );
}

$trigger_style   = $trigger_css_vars ? ' style="' . implode( '; ', $trigger_css_vars ) . '"' : '';
$trigger_classes = implode(
	' ',
	array_filter(
		array(
			'wp-block-aggressive-apparel-modal__trigger',
			'trigger-variant-' . $trigger_variant,
			'trigger-size-' . $trigger_size,
			$trigger_full_width ? 'trigger-full-width' : '',
		)
	)
);

// ── Dialog inline style ───────────────────────────────────────────────────────
// Combines: animation duration, max-width, overlay vars, and block supports.

$dialog_css_vars = array(
	'--aa-modal-duration: ' . esc_attr( (string) $animation_duration ) . 'ms',
);

if ( $dialog_max_width ) {
	$dialog_css_vars[] = '--aa-dialog-max-width: ' . esc_attr( $dialog_max_width );
}
if ( $dialog_background ) {
	$dialog_css_vars[] = '--aa-dialog-bg: ' . esc_attr( $dialog_background );
}

// ── Overlay vars, inherited by dialog::backdrop ───────────────────────────────

$backdrop_css_vars = array();
// Only emit opacity var when it differs from the default (50).
if ( 50 !== $overlay_opacity ) {
	$backdrop_css_vars[] = '--aa-overlay-opacity: ' . esc_attr( (string) $overlay_opacity ) . '%';
}
// Only emit blur var when it differs from the default (4).
if ( 4 !== $overlay_blur ) {
	$backdrop_css_vars[] = '--aa-overlay-blur: ' . esc_attr( (string) $overlay_blur ) . 'px';
}
// Override the scrim color when the editor sets one.
if ( $overlay_color ) {
	$backdrop_css_vars[] = '--aa-color-scrim: ' . esc_attr( $overlay_color );
}
$dialog_css_vars     = array_merge( $dialog_css_vars, $backdrop_css_vars );
$dialog_inline_style = implode( '; ', $dialog_css_vars ) . '; ' . $support_css;
$closed_by           = $disable_overlay ? 'closerequest' : 'any';

// ── Miscellaneous ─────────────────────────────────────────────────────────────

// Drawer positions exit off-screen via their position transform — JS skips exit animation for them.
$drawer_positions = array( 'bottom', 'top', 'left', 'right' );
$is_drawer        = in_array( $position, $drawer_positions, true );
$enter_animation  = $is_drawer ? 'fade' : $enter_animation;
$dialog_classes   = implode(
	' ',
	array_filter(
		array(
			'wp-block-aggressive-apparel-modal__shell',
			'wp-block-aggressive-apparel-modal__dialog',
			'modal-position-' . $position,
			'modal-enter-' . $enter_animation,
			$disable_overlay ? 'is-overlay-disabled' : '',
		)
	)
);

// Register per-modal state.
wp_interactivity_state(
	'aggressive-blocks/modal',
	array(
		'modals' => array(
			$unique_id => array(
				'isOpen'               => false,
				'openOnLoad'           => $open_on_load,
				'openOnLoadOnce'       => $open_on_load_once,
				'animationDuration'    => $animation_duration,
				'exitIntentTrigger'    => $exit_intent_trigger,
				'exitIntentReshowDays' => $exit_intent_reshow_days,
				'scrollDepthTrigger'   => $scroll_depth_trigger,
				'scrollDepthPercent'   => $scroll_depth_percent,
			),
		),
	)
);

?>

<div
	<?php
	echo get_block_wrapper_attributes(
		array(
			'class'               => $show_builtin_trigger ? 'has-built-in-trigger' : 'is-triggerless',
			'data-wp-interactive' => 'aggressive-blocks/modal',
			'data-wp-context'     => (string) wp_json_encode( array( 'id' => $unique_id ) ),
			'data-wp-init'        => 'actions.init',
		)
	);
	?>
>

	<?php if ( $show_builtin_trigger ) : ?>
	<button
		class="<?php echo esc_attr( $trigger_classes ); ?>"
		type="button"
		data-wp-on--click="actions.openModal"
		aria-controls="<?php echo esc_attr( $unique_id ); ?>"
		aria-haspopup="dialog"
		<?php echo aggressive_blocks_trusted_html( $trigger_style ); ?>
	>
		<?php echo esc_html( $trigger_label ); ?>
	</button>
	<?php endif; ?>

	<dialog
		id="<?php echo esc_attr( $unique_id ); ?>"
		class="<?php echo esc_attr( $dialog_classes ); ?>"
		<?php if ( '' !== $dialog_heading_id ) : ?>
		aria-labelledby="<?php echo esc_attr( $dialog_heading_id ); ?>"
		<?php else : ?>
		aria-label="<?php echo esc_attr( $dialog_label ); ?>"
		<?php endif; ?>
		tabindex="-1"
		data-modal-id="<?php echo esc_attr( $unique_id ); ?>"
		data-exit-animation="<?php echo esc_attr( $is_drawer ? 'position' : $exit_animation ); ?>"
		closedby="<?php echo esc_attr( $closed_by ); ?>"
		style="<?php echo esc_attr( $dialog_inline_style ); ?>"
	>
		<?php if ( $show_close_btn && ! $is_outside ) : ?>
			<?php echo aggressive_blocks_trusted_html( $close_btn_html ); ?>
		<?php endif; ?>

		<div class="wp-block-aggressive-apparel-modal__dialog-body">
			<?php echo aggressive_blocks_trusted_html( $content ); ?>
		</div>

		<?php if ( $show_close_btn && $is_outside ) : ?>
			<?php echo aggressive_blocks_trusted_html( $close_btn_html ); ?>
		<?php endif; ?>
	</dialog>

</div>
