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
	 * Production PHP must not call wp_remote_* at runtime.
	 *
	 * @return void
	 */
	public function test_no_runtime_remote_http(): void {
		$hits = $this->search( '/wp_remote_(get|post|request)\s*\(/' );
		$this->assertSame( array(), $hits, 'Uncached frontend HTTP is not allowed in this block plugin.' );
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
