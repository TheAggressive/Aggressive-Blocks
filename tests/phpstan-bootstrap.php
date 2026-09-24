<?php
/**
 * PHPStan bootstrap constants.
 *
 * Function and class stubs come from php-stubs/wordpress-stubs via phpstan.neon.
 *
 * @package Aggressive_Blocks
 */

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', '/tmp/wordpress/' );
}

if ( ! defined( 'WP_DEBUG' ) ) {
	define( 'WP_DEBUG', true );
}

if ( ! defined( 'WP_DEBUG_LOG' ) ) {
	define( 'WP_DEBUG_LOG', true );
}

if ( ! defined( 'WP_DEBUG_DISPLAY' ) ) {
	define( 'WP_DEBUG_DISPLAY', false );
}

if ( ! defined( 'AGGRESSIVE_BLOCKS_VERSION' ) ) {
	define( 'AGGRESSIVE_BLOCKS_VERSION', '1.0.0' );
}

if ( ! defined( 'AGGRESSIVE_BLOCKS_FILE' ) ) {
	define( 'AGGRESSIVE_BLOCKS_FILE', dirname( __DIR__ ) . '/aggressive-blocks.php' );
}

if ( ! defined( 'AGGRESSIVE_BLOCKS_DIR' ) ) {
	define( 'AGGRESSIVE_BLOCKS_DIR', dirname( __DIR__ ) . '/' );
}

if ( ! defined( 'AGGRESSIVE_BLOCKS_URI' ) ) {
	define( 'AGGRESSIVE_BLOCKS_URI', 'http://localhost/wp-content/plugins/aggressive-blocks/' );
}

if ( ! defined( 'AGGRESSIVE_BLOCKS_TEXT_DOMAIN' ) ) {
	define( 'AGGRESSIVE_BLOCKS_TEXT_DOMAIN', 'aggressive-blocks' );
}

if ( ! class_exists( 'WP_CLI' ) ) {
	/**
	 * Minimal WP-CLI stub for static analysis. The real class exists only
	 * when WP-CLI loads the plugin.
	 */
	class WP_CLI {
		/**
		 * @param string $message Message.
		 */
		public static function warning( $message ): void {}

		/**
		 * @param string $message Message.
		 */
		public static function log( $message ): void {}

		/**
		 * @param string $message Message.
		 */
		public static function success( $message ): void {}

		/**
		 * @param string   $name     Command name.
		 * @param callable $callable Command callback.
		 */
		public static function add_command( $name, $callable ): void {}
	}
}
