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
