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
	 * Sequence mode wraps each inner block with animation data attributes.
	 *
	 * @return void
	 */
	public function test_sequence_mode_wraps_children_with_sequence_attributes(): void {
		$markup = '<!-- wp:aggressive-blocks/animate-on-scroll {"useSequence":true,"animationSequence":[{"animation":"fade"},{"animation":"slide","direction":"left"}]} -->'
			. '<!-- wp:paragraph --><p>One</p><!-- /wp:paragraph -->'
			. '<!-- wp:paragraph --><p>Two</p><!-- /wp:paragraph -->'
			. '<!-- /wp:aggressive-blocks/animate-on-scroll -->';

		$html = do_blocks( $markup );

		$this->assertStringContainsString( 'has-animation-sequence', $html );
		$this->assertStringContainsString( 'data-animate-sequence-type="fade"', $html );
		$this->assertStringContainsString( 'data-animate-sequence-type="slide"', $html );
		$this->assertStringContainsString( 'data-animate-sequence-direction="left"', $html );
		$this->assertSame( 2, substr_count( $html, 'data-animate-sequence-type=' ) );
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
