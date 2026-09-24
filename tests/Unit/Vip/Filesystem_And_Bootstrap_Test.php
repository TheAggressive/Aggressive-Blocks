<?php
/**
 * VIP filesystem and multisite bootstrap contracts.
 *
 * @package Aggressive_Blocks\Tests\Unit\Vip
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Vip;

use PHPUnit\Framework\TestCase;

/**
 * Runtime code must not write into the plugin directory.
 */
class Filesystem_And_Bootstrap_Test extends TestCase {

	/**
	 * Production PHP must not write generated files into the plugin tree.
	 *
	 * @return void
	 */
	public function test_production_php_does_not_write_plugin_owned_files(): void {
		$hits  = array();
		$files = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( dirname( __DIR__, 3 ) . '/includes' )
		);

		foreach ( $files as $file ) {
			if ( ! $file->isFile() || 'php' !== $file->getExtension() ) {
				continue;
			}

			$contents = (string) file_get_contents( $file->getPathname() );
			if ( preg_match( '/\b(file_put_contents|fwrite|move_uploaded_file)\s*\(/', $contents ) ) {
				$hits[] = $file->getPathname();
			}
		}

		$this->assertSame( array(), $hits, 'VIP-compatible plugins cannot write generated files into application paths.' );
	}

	/**
	 * Bootstrap does not register an activation hook that writes into the plugin.
	 *
	 * @return void
	 */
	public function test_plugin_bootstrap_has_no_activation_file_writer(): void {
		$header = (string) file_get_contents( dirname( __DIR__, 3 ) . '/aggressive-blocks.php' );
		$this->assertStringNotContainsString( 'register_activation_hook', $header );
	}
}
