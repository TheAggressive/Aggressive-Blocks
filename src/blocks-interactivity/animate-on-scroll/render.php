<?php
/**
 * Animate On Scroll — server render.
 *
 * Children render in their natural, visible state; style.css plays the
 * entrance on first paint (@starting-style), so a block in view at load
 * animates without waiting for the store and content never depends on
 * JavaScript. The store then arms only the blocks that are off screen
 * (data-animate-id) and reveals them as they scroll in. Stagger delays are
 * written here so the first-paint entrance staggers too.
 *
 * The animation is named in data attributes (data-animate-type and
 * data-animate-direction on the wrapper, data-animate-sequence-* on each
 * child in sequence mode), never in bare class names that a theme or
 * framework could also style.
 *
 * @var array<string, mixed> $attributes Block attributes.
 * @var string               $content    Block default content.
 * @var WP_Block             $block      Block instance.
 *
 * @package Aggressive_Blocks
 */

defined( 'ABSPATH' ) || exit;

/**
 * Directions each animation accepts. Keys double as the allowed animations.
 */
$aos_directions = array(
	'fade'   => array(),
	'slide'  => array( 'up', 'down', 'left', 'right' ),
	'zoom'   => array( 'in', 'out' ),
	'flip'   => array( 'up', 'down', 'left', 'right' ),
	'rotate' => array( 'left', 'right' ),
	'blur'   => array(),
	'reveal' => array( 'up', 'down', 'left', 'right' ),
	'bounce' => array( 'standard', 'elastic', 'spring' ),
);

/**
 * A finite number from an attribute, or the fallback.
 *
 * Values land in an inline style, so anything that is not a number (which
 * could close the declaration and start another) falls back.
 *
 * @param mixed     $value    Candidate value.
 * @param int|float $fallback Default.
 * @return string
 */
$aos_number = static function ( $value, $fallback ): string {
	$number = is_numeric( $value ) ? (float) $value : (float) $fallback;
	if ( ! is_finite( $number ) ) {
		$number = (float) $fallback;
	}
	return (string) round( $number, 4 );
};

/**
 * An easing keyword or cubic-bezier(), or `ease`.
 *
 * @param mixed $value Candidate easing.
 * @return string
 */
$aos_easing = static function ( $value ): string {
	$value    = is_string( $value ) ? trim( $value ) : '';
	$keywords = array( 'ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out' );
	if ( in_array( $value, $keywords, true ) ) {
		return $value;
	}
	$number = '\s*-?(?:\d+\.?\d*|\.\d+)\s*';
	if ( preg_match( '/^cubic-bezier\(' . $number . '(?:,' . $number . '){3}\)$/', $value ) ) {
		return $value;
	}
	return 'ease';
};

/**
 * Data attribute value for an animation. Blur is written as `blur-in`, the
 * value style.css and the editor preview have always used.
 *
 * @param string $animation Validated animation.
 * @return string
 */
$aos_animation_value = static function ( string $animation ): string {
	return 'blur' === $animation ? 'blur-in' : $animation;
};

$aos_animation = is_string( $attributes['animation'] ?? null ) && isset( $aos_directions[ $attributes['animation'] ] )
	? $attributes['animation']
	: 'fade';
$aos_direction = is_string( $attributes['direction'] ?? null )
	&& in_array( $attributes['direction'], $aos_directions[ $aos_animation ], true )
	? $attributes['direction']
	: '';

// Sequence items that are well formed and use a known animation.
$aos_sequence = array();
if ( ! empty( $attributes['useSequence'] ) && is_array( $attributes['animationSequence'] ?? null ) ) {
	foreach ( $attributes['animationSequence'] as $aos_item ) {
		if ( ! is_array( $aos_item ) || ! is_string( $aos_item['animation'] ?? null ) || ! isset( $aos_directions[ $aos_item['animation'] ] ) ) {
			continue;
		}
		$aos_sequence[] = $aos_item;
	}
}
$use_sequence = array() !== $aos_sequence;

$default_classes = array( 'wp-block-animate-on-scroll' );
if ( $use_sequence ) {
	$default_classes[] = 'has-animation-sequence';
}

// Capability-gated: never expose debug tooling to visitors even when
// the attribute was saved enabled.
$aos_debug_mode = ! empty( $attributes['debugMode'] )
	&& aggressive_blocks_can_view_block_debug();

if ( $aos_debug_mode ) {
	// Debug-only stylesheet + translated strings blob; kept out of the
	// block's own assets so production visitors never download them.
	aggressive_blocks_enqueue_block_debug_assets();
}

$aos_id                     = uniqid();
$aos_respect_reduced_motion = $attributes['respectReducedMotion'] ?? true;
$aos_stagger_delay          = $aos_number( $attributes['staggerDelay'] ?? 0.2, 0.2 );
$aos_stagger                = ! empty( $attributes['staggerChildren'] );

// Same inputs the store's stagger-math.ts reads. A zero seed gets one
// derived from the block id, shared with the store via data-aos-stagger-seed.
$aos_stagger_config = array(
	'pattern'       => $attributes['staggerPattern'] ?? 'sequential',
	'delay'         => (float) $aos_stagger_delay,
	'waveFrequency' => (float) $aos_number( $attributes['staggerWaveFrequency'] ?? 1, 1 ),
	'randomMin'     => (float) $aos_number( $attributes['staggerRandomMin'] ?? 0, 0 ),
	'randomMax'     => (float) $aos_number( $attributes['staggerRandomMax'] ?? 0.5, 0.5 ),
	'seed'          => absint( $attributes['staggerSeed'] ?? 0 ),
);
if ( 0 === $aos_stagger_config['seed'] ) {
	$aos_stagger_config['seed'] = \Aggressive_Blocks\Blocks\Stagger::hash_to_seed( $aos_id );
}

/**
 * The stagger delay declaration for one child, or '' without stagger.
 *
 * @param int $index Zero-based child index.
 * @param int $total Number of children.
 * @return string
 */
$aos_child_delay = static function ( int $index, int $total ) use ( $aos_stagger, $aos_stagger_config ): string {
	if ( ! $aos_stagger ) {
		return '';
	}
	$delay = \Aggressive_Blocks\Blocks\Stagger::delay( $index, $total, $aos_stagger_config );
	return '--wp-block-animate-on-scroll-stagger-delay: ' . round( $delay, 4 ) . 's;';
};

$wrapper_attributes_array = array(
	'class'                       => implode( ' ', $default_classes ),
	'data-wp-interactive'         => 'aggressive-blocks/animate-on-scroll',
	'data-wp-context'             => wp_json_encode(
		array(
			'isVisible'            => false,
			'hasAnimated'          => false,
			'isExiting'            => false,
			'debugMode'            => $aos_debug_mode,
			'visibilityTrigger'    => $attributes['threshold'] ?? '0.3',
			'detectionBoundary'    => $attributes['detectionBoundary'] ?? array(),
			'id'                   => $aos_id,
			'reverseOnScrollBack'  => $attributes['reverseOnScrollBack'] ?? false,
			'staggerPattern'       => $attributes['staggerPattern'] ?? 'sequential',
			'staggerDelay'         => (float) $aos_stagger_delay,
			'staggerWaveFrequency' => $attributes['staggerWaveFrequency'] ?? 1,
			'staggerRandomMin'     => $attributes['staggerRandomMin'] ?? 0,
			'staggerRandomMax'     => $attributes['staggerRandomMax'] ?? 0.5,
			'staggerSeed'          => absint( $attributes['staggerSeed'] ?? 0 ),
			'respectReducedMotion' => $aos_respect_reduced_motion,
		)
	),
	'data-wp-init'                => 'callbacks.initObserver',
	'data-wp-class--is-visible'   => 'context.isVisible',
	// All wrapper classes must be context-driven: this element's class
	// attribute is vdom-controlled by the class directives, so any
	// imperatively added class is wiped on the next re-render.
	'data-wp-class--has-animated' => 'context.hasAnimated',
	'data-wp-class--is-exiting'   => 'context.isExiting',
	'data-animate-type'           => $use_sequence ? false : $aos_animation_value( $aos_animation ),
	'data-animate-direction'      => $use_sequence || '' === $aos_direction ? false : $aos_direction,
	'data-stagger-children'       => $aos_stagger ? 'true' : false,
	'data-aos-stagger-seed'       => $aos_stagger ? (string) $aos_stagger_config['seed'] : false,
	'data-respect-reduced-motion' => false !== $aos_respect_reduced_motion ? 'true' : false,
);

/*
 * The animation settings are merged into the style attribute core writes
 * for spacing, not emitted as a second style attribute (browsers ignore a
 * duplicate). They are appended after core's safecss pass, which would
 * strip the cubic-bezier() easings; every value is validated above.
 */
$aos_style_vars = array(
	'--wp-block-animate-on-scroll-animation-duration' => $aos_number( $attributes['duration'] ?? 0.5, 0.5 ) . 's',
	'--wp-block-animate-on-scroll-stagger-delay'      => $aos_stagger_delay . 's',
	'--wp-block-animate-on-scroll-initial-delay'      => $aos_number( $attributes['initialDelay'] ?? 0, 0 ) . 's',
	'--wp-block-animate-on-scroll-animation-timing'   => $aos_easing( $attributes['easing'] ?? 'ease' ),
	'--wp-block-animate-on-scroll-slide-distance'     => $aos_number( $attributes['slideDistance'] ?? 50, 50 ) . 'px',
	'--wp-block-animate-on-scroll-zoom-in-start'      => $aos_number( $attributes['zoomInStart'] ?? 0.5, 0.5 ),
	'--wp-block-animate-on-scroll-zoom-out-start'     => $aos_number( $attributes['zoomOutStart'] ?? 1.5, 1.5 ),
	'--wp-block-animate-on-scroll-rotate-angle'       => $aos_number( $attributes['rotationAngle'] ?? 90, 90 ) . 'deg',
	'--wp-block-animate-on-scroll-blur-amount'        => $aos_number( $attributes['blurAmount'] ?? 20, 20 ) . 'px',
	'--wp-block-animate-on-scroll-perspective'        => $aos_number( $attributes['perspective'] ?? 1000, 1000 ) . 'px',
	'--wp-block-animate-on-scroll-bounce-distance'    => $aos_number( $attributes['bounceDistance'] ?? 30, 30 ) . 'px',
	'--wp-block-animate-on-scroll-elastic-distance'   => $aos_number( $attributes['elasticDistance'] ?? 50, 50 ) . 'px',
);

/**
 * Serialize custom properties as `name: value;` declarations.
 *
 * @param array<string, string> $vars Custom properties.
 * @return string
 */
$aos_declarations = static function ( array $vars ): string {
	$declarations = '';
	foreach ( $vars as $name => $value ) {
		$declarations .= $name . ': ' . $value . ';';
	}
	return $declarations;
};

$aos_opening = new WP_HTML_Tag_Processor(
	'<div ' . aggressive_blocks_get_block_wrapper_attributes( $wrapper_attributes_array ) . '>'
);
$aos_opening->next_tag();
$aos_core_style = trim( (string) $aos_opening->get_attribute( 'style' ) );
if ( '' !== $aos_core_style && ! str_ends_with( $aos_core_style, ';' ) ) {
	$aos_core_style .= ';';
}
$aos_opening->set_attribute( 'style', $aos_core_style . $aos_declarations( $aos_style_vars ) );

// Per-item overrides for sequence children.
$aos_sequence_vars = array(
	'slideDistance'   => array( '--wp-block-animate-on-scroll-slide-distance', 'px' ),
	'zoomInStart'     => array( '--wp-block-animate-on-scroll-zoom-in-start', '' ),
	'zoomOutStart'    => array( '--wp-block-animate-on-scroll-zoom-out-start', '' ),
	'rotationAngle'   => array( '--wp-block-animate-on-scroll-rotate-angle', 'deg' ),
	'blurAmount'      => array( '--wp-block-animate-on-scroll-blur-amount', 'px' ),
	'perspective'     => array( '--wp-block-animate-on-scroll-perspective', 'px' ),
	'bounceDistance'  => array( '--wp-block-animate-on-scroll-bounce-distance', 'px' ),
	'elasticDistance' => array( '--wp-block-animate-on-scroll-elastic-distance', 'px' ),
);

/**
 * Append declarations to the style attribute of the current tag.
 *
 * @param WP_HTML_Tag_Processor $processor    Processor positioned on a tag.
 * @param string                $declarations `name: value;` declarations.
 * @return void
 */
$aos_append_style = static function ( WP_HTML_Tag_Processor $processor, string $declarations ): void {
	if ( '' === $declarations ) {
		return;
	}
	$style = trim( (string) $processor->get_attribute( 'style' ) );
	if ( '' !== $style && ! str_ends_with( $style, ';' ) ) {
		$style .= ';';
	}
	$processor->set_attribute( 'style', $style . $declarations );
};

/**
 * Add the stagger delay to each top-level element of the inner content.
 *
 * Content the HTML API cannot parse is returned unchanged; the store writes
 * the same delays once it hydrates.
 *
 * @param string $html Inner block content.
 * @return string
 */
$aos_stagger_content = static function ( string $html ) use ( $aos_child_delay, $aos_append_style ): string {
	$count_pass = \WP_HTML_Processor::create_fragment( $html );
	if ( null === $count_pass ) {
		return $html;
	}
	$top   = null;
	$total = 0;
	while ( $count_pass->next_tag() ) {
		$top = $top ?? $count_pass->get_current_depth();
		if ( $count_pass->get_current_depth() === $top ) {
			++$total;
		}
	}
	if ( 0 === $total || null !== $count_pass->get_last_error() ) {
		return $html;
	}

	$write = \WP_HTML_Processor::create_fragment( $html );
	if ( null === $write ) {
		return $html;
	}
	$index = 0;
	while ( $write->next_tag() ) {
		if ( $write->get_current_depth() !== $top ) {
			continue;
		}
		$aos_append_style( $write, $aos_child_delay( $index, $total ) );
		++$index;
	}
	return null === $write->get_last_error() ? $write->get_updated_html() : $html;
};

/**
 * Mark one rendered sequence child with its animation.
 *
 * The attributes go on the block's own root element, so it stays a direct
 * child of the wrapper and keeps the layout's spacing and alignment rules.
 * Output without exactly one root element (several elements, bare text,
 * nothing, or markup the HTML API cannot parse) is wrapped in a <div>.
 *
 * @param string                $html  Rendered inner block.
 * @param array<string, string> $attrs Attributes to add.
 * @param string                $style Declarations to append to the style attribute.
 * @return string
 */
$aos_mark_sequence_child = static function ( string $html, array $attrs, string $style ) use ( $aos_append_style ): string {
	$roots = 0;
	$scan  = \WP_HTML_Processor::create_fragment( $html );
	if ( null !== $scan ) {
		$top = null;
		while ( $scan->next_token() ) {
			$depth = count( $scan->get_breadcrumbs() ?? array() );
			$top   = $top ?? $depth;
			if ( $depth !== $top || $scan->is_tag_closer() ) {
				continue;
			}
			if ( '#tag' === $scan->get_token_type() ) {
				++$roots;
			} elseif ( '#text' === $scan->get_token_type() && '' !== trim( $scan->get_modifiable_text() ) ) {
				$roots = 0;
				break;
			}
		}
		if ( null !== $scan->get_last_error() ) {
			$roots = 0;
		}
	}

	$single = 1 === $roots;
	$tag    = new WP_HTML_Tag_Processor( $single ? $html : '<div>' );
	$tag->next_tag();
	foreach ( $attrs as $name => $value ) {
		$tag->set_attribute( $name, $value );
	}
	$aos_append_style( $tag, $style );

	return $single ? $tag->get_updated_html() : $tag->get_updated_html() . $html . '</div>';
};

echo aggressive_blocks_trusted_html( $aos_opening->get_updated_html() );

if ( $use_sequence ) {
	$aos_sequence_count = count( $aos_sequence );
	$aos_inner_blocks   = $block->parsed_block['innerBlocks'] ?? array();
	$aos_inner_total    = count( $aos_inner_blocks );
	$child_index        = 0;

	foreach ( $aos_inner_blocks as $inner_block ) {
		$sequence_item = $aos_sequence[ $child_index % $aos_sequence_count ];
		$item_type     = $sequence_item['animation'];

		$item_attrs = array( 'data-animate-sequence-type' => $aos_animation_value( $item_type ) );

		if ( is_string( $sequence_item['direction'] ?? null )
			&& in_array( $sequence_item['direction'], $aos_directions[ $item_type ], true ) ) {
			$item_attrs['data-animate-sequence-direction'] = $sequence_item['direction'];
		}

		$item_vars = array();
		foreach ( $aos_sequence_vars as $key => list( $property, $unit ) ) {
			if ( isset( $sequence_item[ $key ] ) && is_numeric( $sequence_item[ $key ] ) ) {
				$item_vars[ $property ] = $aos_number( $sequence_item[ $key ], 0 ) . $unit;
			}
		}
		$item_style = $aos_declarations( $item_vars ) . $aos_child_delay( $child_index, $aos_inner_total );

		echo aggressive_blocks_trusted_html( $aos_mark_sequence_child( render_block( $inner_block ), $item_attrs, $item_style ) );

		++$child_index;
	}
} else {
	echo aggressive_blocks_trusted_html( $aos_stagger ? $aos_stagger_content( $content ) : $content );
}

echo '</div>';
