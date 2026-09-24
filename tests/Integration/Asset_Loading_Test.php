<?php
/**
 * Block assets stay on block metadata, not plugin-wide enqueues.
 *
 * @package Aggressive_Blocks\Tests\Integration
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Integration;

use PHPUnit\Framework\TestCase;

/**
 * Accidental global CSS/JS would load on every request.
 */
class Asset_Loading_Test extends TestCase {

	/**
	 * Production PHP may enqueue only the debug overlay stylesheet.
	 *
	 * @return void
	 */
	public function test_plugin_php_does_not_globally_enqueue_block_assets(): void {
		$hits  = array();
		$files = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( dirname( __DIR__, 2 ) . '/includes' )
		);

		foreach ( $files as $file ) {
			if ( ! $file->isFile() || 'php' !== $file->getExtension() ) {
				continue;
			}

			$contents = (string) file_get_contents( $file->getPathname() );
			if ( ! preg_match_all( '/wp_enqueue_(style|script)\s*\(\s*[\'"]([^\'"]+)/', $contents, $matches, PREG_SET_ORDER ) ) {
				continue;
			}

			foreach ( $matches as $match ) {
				$handle = $match[2];
				if ( 'aggressive-blocks-debug-overlays' === $handle || 'aggressive-apparel-copyright-data' === $handle ) {
					continue;
				}
				$hits[] = $file->getPathname() . ':' . $handle;
			}
		}

		$this->assertSame( array(), $hits, 'Block CSS/JS must load from block.json, not a global enqueue.' );
	}

	/**
	 * Shared modules remain single registered files, not copied per block.
	 *
	 * @return void
	 */
	public function test_shared_script_modules_register_from_build(): void {
		$this->assertTrue(
			\Aggressive_Blocks\Assets\Asset_Loader::register_interactivity_module(
				'@aggressive-blocks/helpers',
				'build/interactivity/helpers',
				array(),
				false
			)
		);
		$this->assertTrue(
			\Aggressive_Blocks\Assets\Asset_Loader::register_interactivity_module(
				'@aggressive-blocks/scroll-lock',
				'build/interactivity/scroll-lock',
				array(),
				false
			)
		);
	}
}
