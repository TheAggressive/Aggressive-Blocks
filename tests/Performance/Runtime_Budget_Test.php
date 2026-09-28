<?php
/**
 * VIP-scale runtime budget: no unbounded queries or remote HTTP on bootstrap.
 *
 * @package Aggressive_Blocks\Tests\Performance
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Performance;

use PHPUnit\Framework\TestCase;

/**
 * Static checks over production PHP.
 */
class Runtime_Budget_Test extends TestCase {

	/**
	 * Remote HTTP happens in exactly two places, both in the updater: its
	 * bounded client and its package download. Nothing a visitor's request
	 * runs makes a remote call.
	 *
	 * @return void
	 */
	public function test_remote_http_only_in_the_updater(): void {
		$hits = $this->search( '/\b(?:wp_(?:safe_)?remote_(?:get|post|head|request)|vip_safe_wp_remote_get|download_url|curl_init|fsockopen|stream_socket_client)\s*\(/' );
		$root = dirname( __DIR__, 2 ) . '/includes/';
		sort( $hits );

		$this->assertSame(
			array(
				$root . 'Update/class-package-verifier.php',
				$root . 'Update/class-update-http-client.php',
			),
			$hits,
			'Remote HTTP belongs only in the GitHub updater (see docs/updates.md).'
		);
	}

	/**
	 * Direct SQL stays out of the plugin unless added deliberately.
	 *
	 * @return void
	 */
	public function test_no_unprepared_direct_sql(): void {
		$hits = $this->search( '/\$wpdb->(query|get_results|get_var|get_col)\s*\(\s*[\'"]/' );
		$this->assertSame( array(), $hits );
	}

	/**
	 * @param string $pattern PCRE.
	 * @return array<int, string>
	 */
	private function search( string $pattern ): array {
		$hits  = array();
		$files = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( dirname( __DIR__, 2 ) . '/includes' )
		);

		foreach ( $files as $file ) {
			if ( ! $file->isFile() || 'php' !== $file->getExtension() ) {
				continue;
			}
			$contents = (string) file_get_contents( $file->getPathname() );
			if ( preg_match( $pattern, $contents ) ) {
				$hits[] = $file->getPathname();
			}
		}

		return $hits;
	}
}
