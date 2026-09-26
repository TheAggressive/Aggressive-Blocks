<?php
/**
 * Accessible names and dialog semantics for interactive blocks.
 *
 * @package Aggressive_Blocks\Tests\Accessibility
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Accessibility;

use WP_UnitTestCase;

/**
 * Behavioral a11y contracts that scanners cannot replace.
 */
class Interactive_A11y_Contract_Test extends WP_UnitTestCase {

	/**
	 * Modal renders a named dialog and a labeled trigger.
	 *
	 * @return void
	 */
	public function test_modal_exposes_dialog_and_trigger_name(): void {
		$html = (string) render_block(
			array(
				'blockName'    => 'aggressive-blocks/modal',
				'attrs'        => array(
					'triggerLabel' => 'Open size chart',
				),
				'innerBlocks'  => array(),
				'innerContent' => array(),
			)
		);

		$this->assertTrue(
			str_contains( $html, 'role="dialog"' ) || str_contains( $html, '<dialog' )
		);
		$this->assertStringContainsString( 'Open size chart', $html );
	}

	/**
	 * Card flip exposes a toggle control.
	 *
	 * @return void
	 */
	public function test_card_flip_exposes_toggle_control(): void {
		$html = (string) render_block(
			array(
				'blockName'    => 'aggressive-blocks/card-flip',
				'attrs'        => array( 'flipOn' => 'click' ),
				'innerBlocks'  => array(),
				'innerContent' => array(),
			)
		);

		$this->assertStringContainsString( 'aa-card-flip__toggle', $html );
		$this->assertStringContainsString( 'type="button"', $html );
	}

	/**
	 * Card flip renders its back face inert, so it is unreachable before hydration.
	 *
	 * A card nested in a face gets its own inert back; the outer front stays open.
	 *
	 * @return void
	 */
	public function test_card_flip_renders_back_face_inert(): void {
		$card = static function ( string $front, string $back ): string {
			return '<!-- wp:aggressive-blocks/card-flip {"flipOn":"click"} -->'
				. '<!-- wp:aggressive-blocks/card-flip-front -->'
				. '<div class="aa-card-flip__face aa-card-flip__face--front">' . $front . '</div>'
				. '<!-- /wp:aggressive-blocks/card-flip-front -->'
				. '<!-- wp:aggressive-blocks/card-flip-back -->'
				. '<div class="aa-card-flip__face aa-card-flip__face--back">' . $back . '</div>'
				. '<!-- /wp:aggressive-blocks/card-flip-back -->'
				. '<!-- /wp:aggressive-blocks/card-flip -->';
		};

		$html = do_blocks( $card( $card( '<p>IN-F</p>', '<p>IN-B</p>' ), '<p>OUT-B</p>' ) );

		$faces     = array();
		$processor = new \WP_HTML_Tag_Processor( $html );
		while ( $processor->next_tag( array( 'class_name' => 'aa-card-flip__face' ) ) ) {
			$faces[] = array(
				$processor->has_class( 'aa-card-flip__face--back' ) ? 'back' : 'front',
				null !== $processor->get_attribute( 'inert' ),
			);
		}

		// Document order: outer front, inner front, inner back, outer back.
		$this->assertSame(
			array(
				array( 'front', false ),
				array( 'front', false ),
				array( 'back', true ),
				array( 'back', true ),
			),
			$faces
		);
	}

	/**
	 * Ticker pause control has an accessible name.
	 *
	 * @return void
	 */
	public function test_ticker_pause_has_accessible_name(): void {
		$html = (string) render_block(
			array(
				'blockName'    => 'aggressive-blocks/ticker',
				'attrs'        => array(),
				'innerBlocks'  => array(),
				'innerContent' => array(),
			)
		);

		$this->assertTrue(
			str_contains( $html, 'Pause animation' ) || str_contains( $html, 'aria-label' )
		);
	}
}
