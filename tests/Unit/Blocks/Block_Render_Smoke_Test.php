<?php
/**
 * Render smoke tests for migrated blocks.
 *
 * @package Aggressive_Blocks\Tests\Unit\Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Blocks;

use Aggressive_Blocks\Blocks\Blocks;
use WP_UnitTestCase;

/**
 * Smoke-test that key blocks render expected shell markup.
 */
class Block_Render_Smoke_Test extends WP_UnitTestCase {

	/**
	 * Ensure plugin blocks are registered.
	 *
	 * @return void
	 */
	public function setUp(): void {
		parent::setUp();

		if ( ! Blocks::is_block_registered( 'aggressive-blocks/copyright' ) ) {
			Blocks::register();
		}
	}

	/**
	 * Render a registered plugin block.
	 *
	 * @param string               $name       Block slug or full name.
	 * @param array<string, mixed> $attributes Block attributes.
	 * @param array<int, mixed>    $inner      Optional innerBlocks tree.
	 * @return string
	 */
	private function render( string $name, array $attributes = array(), array $inner = array() ): string {
		$block_name = str_starts_with( $name, 'aggressive-blocks/' )
			? $name
			: 'aggressive-blocks/' . $name;

		return (string) render_block(
			array(
				'blockName'    => $block_name,
				'attrs'        => $attributes,
				'innerBlocks'  => $inner,
				'innerContent' => array(),
			)
		);
	}

	/**
	 * Card flip parsed tree with face sentinels.
	 *
	 * @param string $flip_on Flip mode.
	 * @return string
	 */
	private function render_card_flip( string $flip_on ): string {
		$face = static function ( string $sentinel ): array {
			return array(
				'blockName'    => 'core/paragraph',
				'attrs'        => array(),
				'innerBlocks'  => array(),
				'innerContent' => array( '<p>' . $sentinel . '</p>' ),
			);
		};

		return (string) render_block(
			array(
				'blockName'    => 'aggressive-blocks/card-flip',
				'attrs'        => array( 'flipOn' => $flip_on ),
				'innerBlocks'  => array( $face( 'FRONT_SENTINEL' ), $face( 'BACK_SENTINEL' ) ),
				'innerContent' => array( null, null ),
			)
		);
	}

	/**
	 * Hero carousel renders region shell with cover slide content.
	 *
	 * @return void
	 */
	public function test_hero_carousel_renders_region_and_slide(): void {
		$html = $this->render(
			'hero-carousel',
			array(
				'transition' => 'fade',
				'autoplay'   => false,
			),
			array(
				array(
					'blockName'    => 'core/cover',
					'attrs'        => array(
						'url'      => 'https://example.com/hero.jpg',
						'dimRatio' => 0,
					),
					'innerBlocks'  => array(
						array(
							'blockName'    => 'core/paragraph',
							'attrs'        => array(),
							'innerBlocks'  => array(),
							'innerContent' => array( '<p>Drop live</p>' ),
						),
					),
					'innerContent' => array( '<p>Drop live</p>' ),
				),
			)
		);

		$this->assertNotSame( '', $html );
		$this->assertStringContainsString( 'aa-hero', $html );
		$this->assertStringContainsString( 'role="region"', $html );
		$this->assertStringContainsString( 'aria-roledescription="carousel"', $html );
		$this->assertStringContainsString( 'data-wp-interactive="aggressive-blocks/hero-carousel"', $html );
	}

	/**
	 * Hero carousel locks Cover backgrounds to the editor sizeSlug.
	 *
	 * @return void
	 */
	public function test_hero_carousel_respects_cover_image_resolution(): void {
		$attachment_id = self::factory()->attachment->create_upload_object(
			DIR_TESTDATA . '/images/canola.jpg',
			self::factory()->post->create()
		);

		$full = wp_get_attachment_image_src( $attachment_id, 'full' );
		$this->assertIsArray( $full );
		$this->assertNotEmpty( $full[0] );

		$medium    = wp_get_attachment_image_src( $attachment_id, 'medium' );
		$wrong_src = is_array( $medium ) && ! empty( $medium[0] ) ? $medium[0] : 'https://example.com/soft.jpg';

		$cover_img = sprintf(
			'<img class="wp-block-cover__image-background wp-image-%1$d size-full" src="%2$s" data-object-fit="cover" alt="" />',
			$attachment_id,
			esc_url( $wrong_src )
		);

		$html = $this->render(
			'hero-carousel',
			array(
				'transition' => 'fade',
				'autoplay'   => false,
			),
			array(
				array(
					'blockName'    => 'core/cover',
					'attrs'        => array(
						'url'      => $full[0],
						'id'       => $attachment_id,
						'sizeSlug' => 'full',
						'dimRatio' => 0,
					),
					'innerBlocks'  => array(),
					'innerHTML'    => '<div class="wp-block-cover">' . $cover_img . '<div class="wp-block-cover__inner-container"></div></div>',
					'innerContent' => array(
						'<div class="wp-block-cover">' . $cover_img . '<div class="wp-block-cover__inner-container"></div></div>',
					),
				),
			)
		);

		$this->assertStringContainsString( 'src="' . esc_url( $full[0] ) . '"', $html );
		$this->assertStringContainsString( 'sizes="100vw"', $html );
		$this->assertStringContainsString( esc_url( $full[0] ) . ' ' . (int) $full[1] . 'w', $html );
		$this->assertStringNotContainsString( 'src="' . esc_url( $wrong_src ) . '"', $html );
	}

	/**
	 * Card flip always renders the accessible disclosure shell.
	 *
	 * @return void
	 */
	public function test_card_flip_renders_disclosure_shell(): void {
		$html = $this->render_card_flip( 'click' );

		$this->assertStringContainsString( 'aa-card-flip aa-card-flip--click', $html );
		$this->assertStringContainsString( 'data-wp-interactive="aggressive-blocks/card-flip"', $html );
		$this->assertStringContainsString( 'aa-card-flip__inner', $html );
		$this->assertStringContainsString( 'aa-card-flip__toggle', $html );
		$this->assertStringContainsString( 'data-wp-on--click="actions.toggle"', $html );
		$this->assertStringContainsString( 'FRONT_SENTINEL', $html );
		$this->assertStringContainsString( 'BACK_SENTINEL', $html );
	}

	/**
	 * Only the hover variant wires pointer-driven flip.
	 *
	 * @return void
	 */
	public function test_card_flip_hover_variant_adds_pointer_handlers(): void {
		$hover = $this->render_card_flip( 'hover' );
		$this->assertStringContainsString( 'aa-card-flip--hover', $hover );
		$this->assertStringContainsString( 'data-wp-on--mouseenter="actions.pointerEnter"', $hover );

		$click = $this->render_card_flip( 'click' );
		$this->assertStringNotContainsString( 'data-wp-on--mouseenter', $click );
	}

	/**
	 * Ticker renders marquee shell with duplicated track content.
	 *
	 * @return void
	 */
	public function test_ticker_renders_marquee_shell(): void {
		$html = $this->render(
			'ticker',
			array(
				'speed'     => 40,
				'direction' => 'left',
				'showLabel' => true,
				'labelText' => 'LIVE',
				'pattern'   => 'diagonal',
			),
			array(
				array(
					'blockName'    => 'core/paragraph',
					'attrs'        => array(),
					'innerBlocks'  => array(),
					'innerContent' => array( '<p>Drop soon</p>' ),
				),
			)
		);

		$this->assertStringContainsString( 'data-wp-interactive="aggressive-blocks/ticker"', $html );
		$this->assertStringContainsString( 'role="marquee"', $html );
		$this->assertStringContainsString( 'LIVE', $html );
		$this->assertGreaterThanOrEqual( 2, substr_count( $html, 'ticker__content' ) );
	}

	/**
	 * Ticker allowlists reject unknown direction / pattern values.
	 *
	 * @return void
	 */
	public function test_ticker_allowlists_direction_and_pattern(): void {
		$html = $this->render(
			'ticker',
			array(
				'direction' => 'sideways',
				'pattern'   => 'not-a-pattern',
			)
		);

		$this->assertStringContainsString( 'data-ticker-direction="left"', $html );
		$this->assertStringNotContainsString( 'has-pattern-not-a-pattern', $html );
	}

	/**
	 * Horizontal scroll renders carousel shell.
	 *
	 * @return void
	 */
	public function test_horizontal_scroll_renders_carousel_shell(): void {
		$html = $this->render(
			'horizontal-scroll',
			array(
				'showProgress' => true,
				'activation'   => 'top',
			),
			array(
				array(
					'blockName'    => 'core/paragraph',
					'attrs'        => array(),
					'innerBlocks'  => array(),
					'innerContent' => array( '<p>Slide</p>' ),
				),
			)
		);

		$this->assertStringContainsString( 'aa-hscroll', $html );
		$this->assertStringContainsString( 'data-wp-interactive="aggressive-blocks/horizontal-scroll"', $html );
		$this->assertStringContainsString( 'role="progressbar"', $html );
	}

	/**
	 * Horizontal scroll forwards editor blockGap onto --aa-hscroll-gap.
	 *
	 * @return void
	 */
	public function test_horizontal_scroll_forwards_block_gap(): void {
		$html = $this->render(
			'horizontal-scroll',
			array(
				'showProgress' => false,
				'style'        => array(
					'spacing' => array(
						'blockGap' => 'var:preset|spacing|12',
					),
				),
			)
		);

		$this->assertStringContainsString(
			'--aa-hscroll-gap: var(--wp--preset--spacing--12)',
			$html
		);
	}

	/**
	 * Horizontal scroll normalizes legacy proximity and forwards stepDuration.
	 *
	 * @return void
	 */
	public function test_horizontal_scroll_normalizes_proximity_and_step_duration(): void {
		$html = $this->render(
			'horizontal-scroll',
			array(
				'showProgress' => false,
				'snapBehavior' => 'proximity',
				'stepDuration' => 0.8,
			)
		);

		$this->assertStringContainsString( '&quot;snapBehavior&quot;:&quot;off&quot;', $html );
		$this->assertStringContainsString( '&quot;stepDuration&quot;:0.8', $html );
	}
}
