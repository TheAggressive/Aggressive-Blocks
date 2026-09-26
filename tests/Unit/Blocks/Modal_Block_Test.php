<?php
/**
 * Unit tests for the Aggressive Apparel Modal block.
 *
 * @package Aggressive_Blocks\Tests\Unit\Blocks
 */

declare(strict_types=1);


namespace Aggressive_Blocks\Tests\Unit\Blocks;

use Aggressive_Blocks\Blocks\Blocks;
use WP_UnitTestCase;

/**
 * Test modal block render output.
 */
class Modal_Block_Test extends WP_UnitTestCase {

	/**
	 * Register theme blocks.
	 *
	 * @return void
	 */
	public function setUp(): void {
		parent::setUp();
		Blocks::init();
	}

	/**
	 * Render the modal block with the supplied attributes.
	 *
	 * @param array<string, mixed> $attributes Block attributes.
	 * @param string               $content    Saved inner HTML.
	 * @return string Rendered block HTML.
	 */
	private function render_modal( array $attributes, string $content = '' ): string {
		return render_block(
			array(
				'blockName'    => 'aggressive-blocks/modal',
				'attrs'        => $attributes,
				'innerBlocks'  => array(),
				'innerHTML'    => $content,
				'innerContent' => '' === $content ? array() : array( $content ),
			)
		);
	}

	/**
	 * Return the opening tag of an element matched by a regex fragment.
	 *
	 * @param string $html    Rendered HTML.
	 * @param string $pattern Regex fragment matched inside the tag.
	 * @return string The opening tag.
	 */
	private function opening_tag( string $html, string $pattern ): string {
		$this->assertMatchesRegularExpression( '/<[a-z]+\\s[^>]*' . $pattern . '[^>]*>/', $html );
		preg_match( '/<[a-z]+\\s[^>]*' . $pattern . '[^>]*>/', $html, $match );
		return $match[0];
	}

	/**
	 * Without a heading, the built-in trigger's label names the dialog.
	 *
	 * @return void
	 */
	public function test_dialog_accessible_name_and_trigger_aria(): void {
		$html = $this->render_modal(
			array(
				'modalId'      => 'a11y-modal',
				'triggerLabel' => 'View details',
			)
		);

		$dialog = $this->opening_tag( $html, 'id="a11y-modal"' );
		$this->assertStringContainsString( 'aria-label="View details"', $dialog );
		$this->assertStringNotContainsString( 'aria-labelledby', $dialog );
		$this->assertStringContainsString( 'aria-haspopup="dialog"', $html );
		$this->assertStringContainsString( 'aria-controls="a11y-modal"', $html );
		$this->assertStringNotContainsString( 'aria-expanded', $html );
		$this->assertStringNotContainsString( 'aria-live', $html );
	}

	/**
	 * The first heading names the dialog; a heading that has an id keeps it.
	 *
	 * @return void
	 */
	public function test_first_heading_names_the_dialog(): void {
		$html = $this->render_modal(
			array( 'modalId' => 'titled' ),
			'<p>Intro</p><h2 class="wp-block-heading">Size guide</h2><h3>Later</h3>'
		);

		$dialog = $this->opening_tag( $html, 'id="titled"' );
		$this->assertStringContainsString( 'aria-labelledby="titled-title"', $dialog );
		$this->assertStringNotContainsString( 'aria-label=', $dialog );
		$this->assertStringContainsString( '<h2 id="titled-title" class="wp-block-heading">Size guide</h2>', $html );
		$this->assertStringContainsString( '<h3>Later</h3>', $html );

		$anchored = $this->render_modal(
			array( 'modalId' => 'anchored' ),
			'<h2 id="size-guide">Size guide</h2>'
		);
		$this->assertStringContainsString(
			'aria-labelledby="size-guide"',
			$this->opening_tag( $anchored, 'id="anchored"' )
		);
	}

	/**
	 * Headings inside a nested modal do not name the outer dialog.
	 *
	 * @return void
	 */
	public function test_nested_modal_heading_is_skipped(): void {
		$html = $this->render_modal(
			array( 'modalId' => 'outer' ),
			'<dialog id="inner"><h2>Inner title</h2></dialog><h3>Outer title</h3>'
		);

		$this->assertStringContainsString( '<h2>Inner title</h2>', $html );
		$this->assertStringContainsString( '<h3 id="outer-title">Outer title</h3>', $html );
	}

	/**
	 * An explicit dialog name wins over the heading.
	 *
	 * @return void
	 */
	public function test_dialog_label_overrides_heading(): void {
		$html = $this->render_modal(
			array(
				'modalId'     => 'named',
				'dialogLabel' => 'Newsletter sign-up',
			),
			'<h2>Stay in the loop</h2>'
		);

		$dialog = $this->opening_tag( $html, 'id="named"' );
		$this->assertStringContainsString( 'aria-label="Newsletter sign-up"', $dialog );
		$this->assertStringNotContainsString( 'aria-labelledby', $dialog );
		$this->assertStringContainsString( '<h2>Stay in the loop</h2>', $html );
	}

	/**
	 * A triggerless modal without a heading does not borrow the unused trigger label.
	 *
	 * @return void
	 */
	public function test_triggerless_modal_falls_back_to_generic_name(): void {
		$html = $this->render_modal(
			array(
				'modalId'    => 'auto',
				'openOnLoad' => true,
			)
		);

		$this->assertStringContainsString(
			'aria-label="Dialog"',
			$this->opening_tag( $html, 'id="auto"' )
		);
	}

	/**
	 * Icon-only close uses aria-label; visible close label does not duplicate it.
	 *
	 * @return void
	 */
	public function test_close_button_aria_label_only_when_icon_only(): void {
		$icon_only = $this->render_modal( array() );
		$this->assertStringContainsString( 'aria-label="Close modal"', $icon_only );
		$this->assertStringNotContainsString(
			'wp-block-aggressive-apparel-modal__close-label',
			$icon_only
		);

		$labeled = $this->render_modal(
			array(
				'closeButtonLabel' => 'Dismiss',
			)
		);
		$this->assertStringContainsString(
			'wp-block-aggressive-apparel-modal__close-label',
			$labeled
		);
		$this->assertStringContainsString( '>Dismiss</span>', $labeled );
		$this->assertStringNotContainsString(
			'aria-label="Dismiss"',
			$labeled
		);
	}

	/**
	 * The panel is a native dialog. disableOverlay keeps it modal without light dismiss.
	 *
	 * @return void
	 */
	public function test_disable_overlay_omits_backdrop(): void {
		$with = $this->render_modal( array() );
		$this->assertStringContainsString( '<dialog', $with );
		$this->assertStringContainsString( 'closedby="any"', $with );
		$this->assertStringNotContainsString( 'role="dialog"', $with );
		$this->assertStringNotContainsString(
			'wp-block-aggressive-apparel-modal__backdrop',
			$with
		);

		$without = $this->render_modal( array( 'disableOverlay' => true ) );
		$this->assertStringContainsString( 'closedby="closerequest"', $without );
		$this->assertStringContainsString( 'is-overlay-disabled', $without );
	}

	/**
	 * A hidden close button needs the backdrop; without one the button stays.
	 *
	 * @return void
	 */
	public function test_hidden_close_button_requires_the_overlay(): void {
		$hidden = $this->render_modal( array( 'closeButtonPlacement' => 'none' ) );
		$this->assertStringNotContainsString( 'wp-block-aggressive-apparel-modal__close', $hidden );

		$kept = $this->render_modal(
			array(
				'closeButtonPlacement' => 'none',
				'disableOverlay'       => true,
			)
		);
		$this->assertStringContainsString( 'close-placement-inside-top-right', $kept );
	}

	/**
	 * Alternative trigger modes suppress the built-in trigger and its layout box.
	 *
	 * @return void
	 */
	public function test_alternative_triggers_suppress_builtin_trigger(): void {
		foreach (
			array(
				array( 'openOnLoad' => true ),
				array( 'exitIntentTrigger' => true ),
				array( 'scrollDepthTrigger' => true ),
				array( 'triggerBlockId' => 'some-client-id' ),
			) as $attrs
		) {
			$html = $this->render_modal( $attrs );
			$this->assertStringNotContainsString(
				'wp-block-aggressive-apparel-modal__trigger',
				$html,
				'Built-in trigger should be omitted for ' . wp_json_encode( $attrs )
			);
			$this->assertStringContainsString(
				'is-triggerless',
				$html,
				'Triggerless wrapper should collapse for ' . wp_json_encode( $attrs )
			);
		}
	}

	/**
	 * A cleared trigger relationship must not make the modal unreachable.
	 *
	 * @return void
	 */
	public function test_whitespace_trigger_id_keeps_builtin_trigger(): void {
		$html = $this->render_modal( array( 'triggerBlockId' => '   ' ) );

		$this->assertStringContainsString(
			'wp-block-aggressive-apparel-modal__trigger',
			$html
		);
		$this->assertStringContainsString( 'has-built-in-trigger', $html );
		$this->assertStringNotContainsString( 'is-triggerless', $html );
	}

	/**
	 * Outside close stays inside the dialog so it remains in the top layer.
	 *
	 * @return void
	 */
	public function test_outside_close_is_sibling_of_dialog(): void {
		$html = $this->render_modal(
			array(
				'modalId'              => 'out-close',
				'closeButtonPlacement' => 'outside-top-right',
			)
		);

		$this->assertMatchesRegularExpression(
			'/<dialog[^>]*id="out-close"[^>]*>[\\s\\S]*close-placement-outside-top-right[\\s\\S]*<\\/dialog>/',
			$html
		);
	}

	/**
	 * Drawer positions use their positional transform for exit animation.
	 *
	 * @return void
	 */
	public function test_drawer_positions_use_positional_exit_animation(): void {
		$html = $this->render_modal(
			array(
				'position' => 'bottom',
			)
		);

		$this->assertStringContainsString( 'modal-position-bottom', $html );
		$this->assertStringContainsString( 'data-exit-animation="position"', $html );
		$this->assertStringContainsString( 'modal-enter-fade', $html );
	}

	/**
	 * Invalid class, range, and inline-style values fall back safely.
	 *
	 * @return void
	 */
	public function test_invalid_attributes_are_constrained(): void {
		$html = $this->render_modal(
			array(
				'position'          => 'not-a-position',
				'animationDuration' => 99999,
				'overlayOpacity'    => 999,
				'dialogMaxWidth'    => '20rem; color: red',
			)
		);

		$this->assertStringContainsString( 'modal-position-center', $html );
		$this->assertStringContainsString( '--aa-modal-duration: 1000ms', $html );
		$this->assertStringContainsString( '--aa-overlay-opacity: 90%', $html );
		$this->assertStringNotContainsString( '--aa-dialog-max-width', $html );
		$this->assertStringNotContainsString( 'color: red', $html );
	}

	/**
	 * Block supports style the dialog and never the wrapper.
	 *
	 * @return void
	 */
	public function test_block_supports_style_only_the_dialog(): void {
		$html = $this->render_modal(
			array(
				'modalId'         => 'styled',
				'backgroundColor' => 'surface',
				'textColor'       => 'foreground',
				'borderColor'     => 'surfaceElevated',
				'style'           => array(
					'border'  => array( 'width' => '24px' ),
					'spacing' => array(
						'padding' => array( 'top' => 'var:preset|spacing|40' ),
						'margin'  => array( 'top' => '8px' ),
					),
					'shadow'  => 'var:preset|shadow|x-large',
				),
			)
		);

		$wrapper = $this->opening_tag( $html, 'wp-block-aggressive-blocks-modal' );
		$this->assertStringNotContainsString( 'has-background', $wrapper );
		$this->assertStringNotContainsString( 'border', $wrapper );
		$this->assertStringNotContainsString( 'style=', $wrapper );

		$dialog = $this->opening_tag( $html, 'id="styled"' );
		$this->assertStringContainsString( 'background-color:var(--wp--preset--color--surface)', $dialog );
		$this->assertStringContainsString( '--aa-dialog-bg: var(--wp--preset--color--surface)', $dialog );
		$this->assertStringContainsString( 'color:var(--wp--preset--color--foreground)', $dialog );
		$this->assertStringContainsString( 'border-color:var(--wp--preset--color--surface-elevated)', $dialog );
		$this->assertStringContainsString( 'border-width:24px', $dialog );
		$this->assertStringContainsString( 'padding-top:var(--wp--preset--spacing--40)', $dialog );
		$this->assertStringContainsString( 'box-shadow:var(--wp--preset--shadow--x-large)', $dialog );
		$this->assertStringNotContainsString( 'margin', $dialog );
	}

	/**
	 * Scalar and per-corner radius values reach the dialog.
	 *
	 * @return void
	 */
	public function test_border_radius_is_forwarded(): void {
		$scalar = $this->render_modal(
			array(
				'modalId' => 'round',
				'style'   => array(
					'border' => array( 'radius' => '12px' ),
				),
			)
		);
		$this->assertStringContainsString( 'border-radius:12px', $this->opening_tag( $scalar, 'id="round"' ) );

		$corners = $this->render_modal(
			array(
				'modalId' => 'corners',
				'style'   => array(
					'border' => array(
						'radius' => array(
							'topLeft'     => '1px',
							'bottomRight' => '3px',
						),
					),
				),
			)
		);
		$dialog  = $this->opening_tag( $corners, 'id="corners"' );
		$this->assertStringContainsString( 'border-top-left-radius:1px', $dialog );
		$this->assertStringContainsString( 'border-bottom-right-radius:3px', $dialog );
		$this->assertStringNotContainsString( 'Array', $dialog );
	}

	/**
	 * Unsafe block-support values are filtered out of the dialog style.
	 *
	 * @return void
	 */
	public function test_unsafe_support_values_are_filtered(): void {
		$html = $this->render_modal(
			array(
				'modalId' => 'unsafe',
				'style'   => array(
					'color' => array( 'text' => 'expression(alert(1))' ),
				),
			)
		);

		$this->assertStringNotContainsString( 'expression', $html );
	}

	/**
	 * Unmigrated posts keep their legacy padding and radius on the dialog.
	 *
	 * @return void
	 */
	public function test_legacy_design_attributes_still_style_the_dialog(): void {
		$html   = $this->render_modal(
			array(
				'modalId'            => 'legacy-design',
				'dialogPadding'      => '2rem 1rem',
				'dialogBorderRadius' => '6px',
				'style'              => array(
					'spacing' => array( 'padding' => array( 'top' => '9px' ) ),
				),
			)
		);
		$dialog = $this->opening_tag( $html, 'id="legacy-design"' );

		$this->assertStringContainsString( 'padding:2rem 1rem', $dialog );
		$this->assertStringNotContainsString( 'padding-top:9px', $dialog );
		$this->assertStringContainsString( 'border-radius:6px', $dialog );
	}

	/**
	 * Content saved inside the old wrapper copy is unwrapped, v1 close button included.
	 *
	 * @return void
	 */
	public function test_legacy_saved_wrapper_is_unwrapped(): void {
		$v2 = $this->render_modal(
			array( 'modalId' => 'legacy-v2' ),
			'<div class="wp-block-aggressive-blocks-modal has-background" style="border-width:24px"><h3 class="wp-block-heading">Modal Title</h3><p>Body</p></div>'
		);
		$this->assertSame( 1, substr_count( $v2, 'wp-block-aggressive-blocks-modal' ) );
		$this->assertStringNotContainsString( 'border-width:24px', $v2 );
		$this->assertMatchesRegularExpression(
			'#<div class="wp-block-aggressive-apparel-modal__dialog-body">\s*<h3 id="legacy-v2-title" class="wp-block-heading">Modal Title</h3><p>Body</p>\s*</div>#',
			$v2
		);

		$v1 = $this->render_modal(
			array( 'modalId' => 'legacy-v1' ),
			'<div class="wp-block-aggressive-blocks-modal"><button class="wp-block-aggressive-apparel-modal__close" type="button" data-wp-on--click="actions.closeModal" aria-label="Close modal">✕</button><p>Body</p></div>'
		);
		$this->assertSame( 1, substr_count( $v1, 'wp-block-aggressive-apparel-modal__close' ) );
		$this->assertStringNotContainsString( '✕', $v1 );
	}
}
