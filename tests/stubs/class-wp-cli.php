<?php
/**
 * Minimal WP_CLI double so Cli::migrate() can run under PHPUnit.
 *
 * @package Aggressive_Blocks\Tests
 */

// phpcs:ignoreFile -- global test double for the WP-CLI runner.

/**
 * Records command output instead of printing it.
 */
class WP_CLI {

	/**
	 * Output lines, prefixed with their level.
	 *
	 * @var array<int, string>
	 */
	public static array $output = array();

	public static function add_command( string $name, callable $callable ): void {
		unset( $name, $callable );
	}

	public static function log( string $message ): void {
		self::$output[] = $message;
	}

	public static function warning( string $message ): void {
		self::$output[] = 'Warning: ' . $message;
	}

	public static function success( string $message ): void {
		self::$output[] = 'Success: ' . $message;
	}
}
