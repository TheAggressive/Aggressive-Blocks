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
	 * A single Cover slide for hero carousel render tests.
	 *
	 * @param array<string, mixed> $attrs Cover attributes.
	 * @return array<string, mixed>
	 */
	private function hero_slide( array $attrs = array() ): array {
		return array(
			'blockName'    => 'core/cover',
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerContent' => array(),
		);
	}

	/**
	 * Hero carousel writes the HTML anchor as the root id (deep links need it).
	 *
	 * @return void
	 */
	public function test_hero_carousel_renders_anchor_id(): void {
		$html = $this->render(
			'hero-carousel',
			array(
				'anchor'   => 'spring-drop',
				'deepLink' => true,
			),
			array( $this->hero_slide(), $this->hero_slide() )
		);

		$this->assertMatchesRegularExpression( '/<section[^>]*\sid="spring-drop"/', $html );
	}

	/**
	 * Hero carousel keeps valid chrome colors and drops anything else.
	 *
	 * @return void
	 */
	public function test_hero_carousel_allowlists_chrome_colors(): void {
		$html = $this->render(
			'hero-carousel',
			array(
				'arrowColor'     => '#ff0055',
				'arrowBg'        => '#00000080',
				'dotColor'       => 'var(--wp--preset--color--contrast)',
				'dotActiveColor' => 'red; background-image: url(https://example.com/x.png)',
				'pagination'     => 'thumbnails',
			),
			array(
				$this->hero_slide( array( 'customOverlayColor' => '#000; position: fixed' ) ),
				$this->hero_slide( array( 'customOverlayColor' => '#123456' ) ),
			)
		);

		$this->assertStringContainsString( '--aa-hero-arrow-color: #ff0055;', $html );
		$this->assertStringContainsString( '--aa-hero-arrow-bg: #00000080;', $html );
		$this->assertStringContainsString( '--aa-hero-dot-color: var(--wp--preset--color--contrast)', $html );
		$this->assertStringNotContainsString( '--aa-hero-dot-active-color', $html );
		$this->assertStringNotContainsString( 'example.com/x.png', $html );
		$this->assertStringNotContainsString( 'position: fixed', $html );
		$this->assertStringContainsString( 'style="background:#123456"', $html );
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
		$this->assertStringContainsString(
			sprintf( 'sizes="max(100vw, %svh)"', round( 100 * $full[1] / $full[2], 2 ) ),
			$html
		);
		$this->assertStringContainsString( esc_url( $full[0] ) . ' ' . (int) $full[1] . 'w', $html );
		$this->assertStringNotContainsString( 'src="' . esc_url( $wrong_src ) . '"', $html );

		// Every generated size is offered so each device fetches only what it needs.
		$this->assertIsArray( $medium );
		$this->assertStringContainsString( esc_url( $medium[0] ) . ' ' . (int) $medium[1] . 'w', $html );
	}

	/**
	 * Opening tag of a rendered animate-on-scroll block.
	 *
	 * @param array<string, mixed> $attributes Block attributes.
	 * @param array<int, mixed>    $inner      Optional innerBlocks tree.
	 * @return string
	 */
	private function render_aos_opening( array $attributes, array $inner = array() ): string {
		$html = $this->render( 'animate-on-scroll', $attributes, $inner );
		$this->assertSame( 1, preg_match( '/<div[^>]*>/', $html, $match ) );
		return $match[0];
	}

	/**
	 * Animation settings share one style attribute with core's spacing styles.
	 *
	 * @return void
	 */
	public function test_animate_on_scroll_merges_settings_into_one_style_attribute(): void {
		$opening = $this->render_aos_opening(
			array(
				'animation' => 'slide',
				'direction' => 'up',
				'duration'  => 2,
				'easing'    => 'cubic-bezier(0.34, 1.56, 0.64, 1)',
				'style'     => array( 'spacing' => array( 'padding' => array( 'top' => '40px' ) ) ),
			)
		);

		$this->assertSame( 1, preg_match_all( '/\sstyle="/', $opening ) );
		$this->assertStringContainsString( 'padding-top:40px;', $opening );
		$this->assertStringContainsString( '--wp-block-animate-on-scroll-animation-duration: 2s;', $opening );
		$this->assertStringContainsString( '--wp-block-animate-on-scroll-animation-timing: cubic-bezier(0.34, 1.56, 0.64, 1);', $opening );
	}

	/**
	 * Values that are not numbers or easings fall back instead of reaching the style.
	 *
	 * @return void
	 */
	public function test_animate_on_scroll_rejects_style_injection(): void {
		$opening = $this->render_aos_opening(
			array(
				'animation'     => 'slide',
				'direction'     => 'up; x',
				'easing'        => 'ease; background-image: url(https://example.com/a.png)',
				'slideDistance' => '10px; position: fixed',
			)
		);

		$this->assertStringNotContainsString( 'example.com', $opening );
		$this->assertStringNotContainsString( 'position: fixed', $opening );
		$this->assertStringContainsString( '--wp-block-animate-on-scroll-animation-timing: ease;', $opening );
		$this->assertStringContainsString( '--wp-block-animate-on-scroll-slide-distance: 50px;', $opening );
		$this->assertStringNotContainsString( 'up; x', $opening );
	}

	/**
	 * The block renders unarmed (visible) and flags whether it respects reduced motion.
	 *
	 * @return void
	 */
	public function test_animate_on_scroll_renders_unarmed(): void {
		$respects = $this->render_aos_opening( array() );
		$this->assertStringNotContainsString( 'data-animate-id', $respects );
		$this->assertStringContainsString( 'data-respect-reduced-motion="true"', $respects );

		$opted_out = $this->render_aos_opening( array( 'respectReducedMotion' => false ) );
		$this->assertStringNotContainsString( 'data-respect-reduced-motion', $opted_out );
	}

	/**
	 * Stagger delays are written on each top-level child for the first-paint entrance.
	 *
	 * @return void
	 */
	public function test_animate_on_scroll_writes_stagger_delays(): void {
		$html = $this->render(
			'animate-on-scroll',
			array(
				'staggerChildren' => true,
				'staggerDelay'    => 0.25,
				'staggerSeed'     => 42,
			),
			array()
		);
		$this->assertStringContainsString( 'data-aos-stagger-seed="42"', $html );

		$markup = '<p>A</p><p style="color:red">B <span>not top level</span></p><ul><li>C</li></ul>';
		$html   = (string) render_block(
			array(
				'blockName'    => 'aggressive-blocks/animate-on-scroll',
				'attrs'        => array(
					'staggerChildren' => true,
					'staggerDelay'    => 0.25,
				),
				'innerBlocks'  => array(),
				'innerContent' => array( $markup ),
			)
		);

		$this->assertStringContainsString( '<p style="--wp-block-animate-on-scroll-stagger-delay: 0s;">A</p>', $html );
		$this->assertStringContainsString( '<p style="color:red;--wp-block-animate-on-scroll-stagger-delay: 0.25s;">B <span>not top level</span></p>', $html );
		$this->assertStringContainsString( '<ul style="--wp-block-animate-on-scroll-stagger-delay: 0.5s;"><li>C</li></ul>', $html );
		$this->assertMatchesRegularExpression( '/data-aos-stagger-seed="\d+"/', $html );
	}

	/**
	 * The PHP stagger port reproduces stagger-math.ts (values from the TypeScript).
	 *
	 * @return void
	 */
	public function test_stagger_matches_the_typescript_math(): void {
		$config = static fn( string $pattern, int $seed = 0 ): array => array(
			'pattern'       => $pattern,
			'delay'         => 0.2,
			'waveFrequency' => 2,
			'randomMin'     => 0.1,
			'randomMax'     => 0.9,
			'seed'          => $seed,
		);
		$delays = static fn( int $total, array $cfg ): array => array_map(
			static fn( int $i ): float => \Aggressive_Blocks\Blocks\Stagger::delay( $i, $total, $cfg ),
			range( 0, $total - 1 )
		);

		$expected = array(
			'sequential' => array( 0, 0.2, 0.4, 0.6000000000000001 ),
			'wave'       => array( 0, 0.19999999999999998, 0.4, 0.20000000000000007, 0 ),
			'random42'   => array( 0.25677229966968296, 0.8269392337650061, 0.713194564729929, 0.5967313813045622 ),
			'randomHigh' => array( 0.5559136474505068, 0.6179716810584068, 0.23744765147566796 ),
		);

		$this->assertEqualsWithDelta( $expected['sequential'], $delays( 4, $config( 'sequential' ) ), 1e-12 );
		$this->assertEqualsWithDelta( $expected['wave'], $delays( 5, $config( 'wave' ) ), 1e-12 );
		$this->assertEqualsWithDelta( $expected['random42'], $delays( 4, $config( 'random', 42 ) ), 1e-12 );
		$this->assertEqualsWithDelta( $expected['randomHigh'], $delays( 3, $config( 'random', 4000000000 ) ), 1e-12 );
		$this->assertSame( 1015199447, \Aggressive_Blocks\Blocks\Stagger::hash_to_seed( '6ab762bc38231' ) );
	}

	/**
	 * Malformed sequence items are skipped rather than breaking the render.
	 *
	 * @return void
	 */
	public function test_animate_on_scroll_skips_malformed_sequence_items(): void {
		$paragraph = array(
			'blockName'    => 'core/paragraph',
			'attrs'        => array(),
			'innerBlocks'  => array(),
			'innerContent' => array( '<p>Child</p>' ),
		);

		$html = $this->render(
			'animate-on-scroll',
			array(
				'useSequence'       => true,
				'animationSequence' => array(
					'broken',
					array( 'direction' => 'up' ),
					array(
						'animation'     => 'slide',
						'direction'     => 'left',
						'slideDistance' => 80,
					),
				),
			),
			array( $paragraph, $paragraph )
		);

		$this->assertStringContainsString( 'has-animation-sequence', $html );
		$this->assertSame( 2, substr_count( $html, 'data-animate-sequence-type="slide"' ) );
		$this->assertStringContainsString( 'data-animate-sequence-direction="left"', $html );
		$this->assertStringContainsString( '--wp-block-animate-on-scroll-slide-distance: 80px;', $html );
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
		$this->assertStringContainsString( 'data-wp-on--pointerenter="actions.pointerEnter"', $hover );
		$this->assertStringContainsString( 'data-wp-on--pointerleave="actions.pointerLeave"', $hover );

		$click = $this->render_card_flip( 'click' );
		$this->assertStringNotContainsString( 'data-wp-on--pointerenter', $click );
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
