<?php
/**
 * Animate On Scroll render tests.
 *
 * @package Aggressive_Blocks\Tests\Unit\Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Blocks;

use Aggressive_Blocks\Blocks\Blocks;
use WP_UnitTestCase;

/**
 * Locks sequence wrapping and screen-reader announce defaults.
 */
class Animate_On_Scroll_Block_Test extends WP_UnitTestCase {

	/**
	 * Register theme blocks once for render tests.
	 *
	 * @return void
	 */
	public function setUp(): void {
		parent::setUp();

		if ( ! Blocks::is_block_registered( 'aggressive-blocks/animate-on-scroll' ) ) {
			Blocks::register();
		}
	}

	/**
	 * Sequence mode marks each inner block's own root element, so children
	 * stay direct children of the layout.
	 *
	 * @return void
	 */
	public function test_sequence_mode_marks_each_child_root(): void {
		$markup = '<!-- wp:aggressive-blocks/animate-on-scroll {"useSequence":true,"animationSequence":[{"animation":"fade"},{"animation":"slide","direction":"left","slideDistance":80}]} -->'
			. '<!-- wp:paragraph --><p>One</p><!-- /wp:paragraph -->'
			. '<!-- wp:paragraph --><p style="color:red">Two</p><!-- /wp:paragraph -->'
			. '<!-- /wp:aggressive-blocks/animate-on-scroll -->';

		$html = do_blocks( $markup );

		$this->assertStringContainsString( 'has-animation-sequence', $html );
		$this->assertMatchesRegularExpression( '/<p [^>]*data-animate-sequence-type="fade"[^>]*>One<\/p>/', $html );
		$this->assertMatchesRegularExpression( '/<p [^>]*data-animate-sequence-type="slide"[^>]*>Two<\/p>/', $html );
		$this->assertMatchesRegularExpression( '/<p [^>]*data-animate-sequence-direction="left"[^>]*>Two<\/p>/', $html );
		$this->assertStringContainsString( 'style="color:red;--wp-block-animate-on-scroll-slide-distance: 80px;"', $html );
		$this->assertStringNotContainsString( '<div data-animate-sequence-type', $html );
		$this->assertSame( 2, substr_count( $html, 'data-animate-sequence-type=' ) );
	}

	/**
	 * A sequence child without a single root element is wrapped in a div.
	 *
	 * @return void
	 */
	public function test_sequence_mode_wraps_children_without_a_single_root(): void {
		$markup = '<!-- wp:aggressive-blocks/animate-on-scroll {"useSequence":true,"animationSequence":[{"animation":"zoom","direction":"in"}]} -->'
			. '<!-- wp:html --><span>A</span><span>B</span><!-- /wp:html -->'
			. '<!-- wp:html -->Bare text<!-- /wp:html -->'
			. '<!-- wp:html -->' . "\n" . '<em>Only</em>' . "\n" . '<!-- /wp:html -->'
			. '<!-- /wp:aggressive-blocks/animate-on-scroll -->';

		$html = do_blocks( $markup );

		$this->assertMatchesRegularExpression( '/<div [^>]*data-animate-sequence-type="zoom"[^>]*><span>A<\/span><span>B<\/span><\/div>/', $html );
		$this->assertMatchesRegularExpression( '/<div [^>]*data-animate-sequence-type="zoom"[^>]*>Bare text<\/div>/', $html );
		$this->assertMatchesRegularExpression( '/<em [^>]*data-animate-sequence-type="zoom"[^>]*>Only<\/em>/', $html );
		$this->assertSame( 3, substr_count( $html, 'data-animate-sequence-type=' ) );
	}

	/**
	 * The wrapper names its animation in data attributes, not bare classes,
	 * and carries no unread copy of the sequence.
	 *
	 * @return void
	 */
	public function test_wrapper_names_animation_in_data_attributes(): void {
		$slide = do_blocks( '<!-- wp:aggressive-blocks/animate-on-scroll {"animation":"slide","direction":"left"} --><!-- wp:paragraph --><p>A</p><!-- /wp:paragraph --><!-- /wp:aggressive-blocks/animate-on-scroll -->' );
		$this->assertStringContainsString( 'data-animate-type="slide"', $slide );
		$this->assertStringContainsString( 'data-animate-direction="left"', $slide );
		$this->assertDoesNotMatchRegularExpression( '/class="[^"]*\b(slide|left)\b/', $slide );
		$this->assertStringNotContainsString( 'data-stagger-children', $slide );

		$blur = do_blocks( '<!-- wp:aggressive-blocks/animate-on-scroll {"animation":"blur","direction":"up"} --><!-- /wp:aggressive-blocks/animate-on-scroll -->' );
		$this->assertStringContainsString( 'data-animate-type="blur-in"', $blur );
		$this->assertStringNotContainsString( 'data-animate-direction', $blur );

		$sequence = do_blocks( '<!-- wp:aggressive-blocks/animate-on-scroll {"useSequence":true,"animationSequence":[{"animation":"fade"}]} --><!-- wp:paragraph --><p>A</p><!-- /wp:paragraph --><!-- /wp:aggressive-blocks/animate-on-scroll -->' );
		$this->assertStringNotContainsString( 'data-animate-type', $sequence );
		$this->assertStringNotContainsString( 'data-animation-sequence', $sequence );
		$this->assertStringNotContainsString( 'animationSequence', $sequence );
		$this->assertStringNotContainsString( 'useSequence', $sequence );
	}

	/**
	 * The context carries no screen-reader announcement, even for a block
	 * saved with the retired option on.
	 *
	 * @return void
	 */
	public function test_context_has_no_screen_reader_announcement(): void {
		$markup = '<!-- wp:aggressive-blocks/animate-on-scroll {"announceToScreenReader":true} -->'
			. '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->'
			. '<!-- /wp:aggressive-blocks/animate-on-scroll -->';

		$html = do_blocks( $markup );

		$this->assertSame(
			1,
			preg_match( '/data-wp-context="([^"]+)"/', $html, $matches ),
			'Rendered block should expose a data-wp-context attribute.'
		);

		$context = json_decode( html_entity_decode( $matches[1], ENT_QUOTES ), true );
		$this->assertIsArray( $context );
		$this->assertArrayNotHasKey( 'announceToScreenReader', $context );
		$this->assertArrayNotHasKey( 'i18n', $context );
		$this->assertStringNotContainsString( 'Content animated into view', $html );
	}
}
