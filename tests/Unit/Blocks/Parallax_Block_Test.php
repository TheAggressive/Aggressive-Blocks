<?php
/**
 * Parallax block render coverage.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Blocks;

use WP_UnitTestCase;

/**
 * @group blocks
 * @group parallax
 */
class Parallax_Block_Test extends WP_UnitTestCase {

	/**
	 * Render the block with the given attributes and inner HTML.
	 */
	private function render_parallax( array $attributes, string $inner = '<p>Layer</p>' ): string {
		$block = array(
			'blockName'    => 'aggressive-blocks/parallax',
			'attrs'        => $attributes,
			'innerContent' => array( $inner ),
			'innerHTML'    => $inner,
			'innerBlocks'  => array(),
		);

		return (string) render_block( $block );
	}

	public function test_disable_on_mobile_class_and_context(): void {
		$html = $this->render_parallax(
			array(
				'disableOnMobile' => true,
				'intensity'       => 50,
			)
		);

		$this->assertStringContainsString(
			'aggressive-apparel-parallax--disable-on-mobile',
			$html
		);
		// Context is HTML-escaped inside data-wp-context.
		$this->assertStringContainsString( '&quot;disableOnMobile&quot;:true', $html );
		$this->assertStringNotContainsString( '__visual-layer', $html );
		$this->assertStringContainsString(
			'aggressive-apparel-parallax__content',
			$html
		);
	}

	public function test_default_keeps_mobile_motion_enabled(): void {
		$html = $this->render_parallax( array( 'intensity' => 40 ) );

		$this->assertStringNotContainsString(
			'aggressive-apparel-parallax--disable-on-mobile',
			$html
		);
		$this->assertStringContainsString( '&quot;disableOnMobile&quot;:false', $html );
	}

	public function test_inner_content_is_not_stripped(): void {
		// Regression: the render ran $content through wp_kses_post(), which
		// removed forms, inputs, SVG icons and embeds from nested blocks.
		$inner = '<form role="search"><input type="search" name="s"><button>Go</button></form>'
			. '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 1h2"/></svg>'
			. '<iframe src="https://www.youtube.com/embed/x" title="Video"></iframe>';

		$html = $this->render_parallax( array(), $inner );

		$this->assertStringContainsString( '<input type="search" name="s">', $html );
		$this->assertStringContainsString( '<svg viewBox="0 0 24 24"', $html );
		$this->assertStringContainsString( '<iframe src="https://www.youtube.com/embed/x"', $html );
	}

	public function test_untrusted_attributes_are_normalized(): void {
		$html = $this->render_parallax(
			array(
				'parallaxDirection' => 'sideways" onclick="x',
				'visibilityTrigger' => 7,
				'intensity'         => 'lots',
				'detectionBoundary' => array(
					'top'    => '10%',
					'bottom' => 'calc(1px)',
					'right'  => array(),
					'left'   => '-20px',
				),
			)
		);

		$this->assertStringContainsString( 'aggressive-apparel-parallax--direction-down', $html );
		$this->assertStringNotContainsString( 'sideways', $html );
		$this->assertStringContainsString( '&quot;visibilityTrigger&quot;:1', $html );
		$this->assertStringContainsString( '&quot;intensity&quot;:50', $html );
		$this->assertStringContainsString(
			'&quot;detectionBoundary&quot;:{&quot;top&quot;:&quot;10%&quot;,&quot;right&quot;:&quot;0%&quot;,&quot;bottom&quot;:&quot;0%&quot;,&quot;left&quot;:&quot;-20px&quot;}',
			$html
		);
	}

	public function test_instance_ids_are_unique_per_render(): void {
		preg_match( '/data-instance-id="([^"]+)"/', $this->render_parallax( array() ), $first );
		preg_match( '/data-instance-id="([^"]+)"/', $this->render_parallax( array() ), $second );

		$this->assertNotEmpty( $first[1] ?? '' );
		$this->assertNotSame( $first[1], $second[1] ?? '' );
	}
}
