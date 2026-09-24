<?php
/**
 * VIP-oriented security contracts for plugin REST and HTML output.
 *
 * @package Aggressive_Blocks\Tests\Security
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Security;

use WP_REST_Request;
use WP_UnitTestCase;

/**
 * Permission callbacks and escaped copyright output.
 */
class Rest_And_Output_Test extends WP_UnitTestCase {

	/**
	 * Icon REST routes require an authenticated editor.
	 *
	 * @return void
	 */
	public function test_icon_rest_routes_are_permissioned(): void {
		wp_set_current_user( 0 );
		$request  = new WP_REST_Request( 'GET', '/aggressive-blocks/v1/icons' );
		$response = rest_do_request( $request );
		$this->assertSame( 401, $response->get_status() );
	}

	/**
	 * Copyright owner text is escaped.
	 *
	 * @return void
	 */
	public function test_copyright_escapes_owner_output(): void {
		$html = (string) render_block(
			array(
				'blockName'    => 'aggressive-blocks/copyright',
				'attrs'        => array(
					'ownerSource' => 'custom',
					'ownerName'   => '<script>alert(1)</script>',
					'prefix'      => '©',
					'showSchema'  => false,
				),
				'innerBlocks'  => array(),
				'innerContent' => array(),
			)
		);

		$this->assertStringNotContainsString( '<script>alert', $html );
		$this->assertStringNotContainsString( 'alert(1)', $html );
	}

	/**
	 * Plugin bootstrap never eval()s request input.
	 *
	 * @return void
	 */
	public function test_production_php_has_no_eval_or_unserialize(): void {
		$files = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( dirname( __DIR__, 2 ) . '/includes' )
		);

		foreach ( $files as $file ) {
			if ( ! $file->isFile() || 'php' !== $file->getExtension() ) {
				continue;
			}
			$contents = (string) file_get_contents( $file->getPathname() );
			$this->assertDoesNotMatchRegularExpression( '/\beval\s*\(/', $contents, $file->getPathname() );
			$this->assertDoesNotMatchRegularExpression( '/\bunserialize\s*\(/', $contents, $file->getPathname() );
		}
	}
}
