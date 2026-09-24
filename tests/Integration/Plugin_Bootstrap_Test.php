<?php
/**
 * Plugin activation and independent-site registration.
 *
 * @package Aggressive_Blocks\Tests\Integration
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Integration;

use Aggressive_Blocks\Blocks\Blocks;
use WP_UnitTestCase;

/**
 * The plugin registers without Aggressive Apparel.
 */
class Plugin_Bootstrap_Test extends WP_UnitTestCase {

	/**
	 * Every extracted block is registered under the plugin namespace.
	 *
	 * @return void
	 */
	public function test_plugin_blocks_register_without_theme(): void {
		$this->assertFalse( class_exists( '\\Aggressive_Apparel\\Bootstrap', false ) );

		$names = array(
			'aggressive-blocks/animate-on-scroll',
			'aggressive-blocks/parallax',
			'aggressive-blocks/modal',
			'aggressive-blocks/card-flip',
			'aggressive-blocks/horizontal-scroll',
			'aggressive-blocks/hero-carousel',
			'aggressive-blocks/ticker',
			'aggressive-blocks/split-story',
			'aggressive-blocks/copyright',
		);

		foreach ( $names as $name ) {
			$this->assertTrue( Blocks::is_block_registered( $name ), $name );
		}
	}

	/**
	 * A second init does not fatal; blocks stay registered.
	 *
	 * @return void
	 */
	public function test_blocks_remain_registered_after_init(): void {
		$this->assertTrue( Blocks::is_block_registered( 'aggressive-blocks/copyright' ) );
		$this->assertTrue( Blocks::is_block_registered( 'aggressive-blocks/modal' ) );
	}
}
