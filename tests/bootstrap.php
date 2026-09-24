<?php
/**
 * PHPUnit bootstrap for Aggressive Blocks.
 *
 * @package Aggressive_Blocks
 */

$_tests_dir = getenv( 'WP_TESTS_DIR' );

if ( ! $_tests_dir ) {
	$_tests_dir = dirname( __DIR__ ) . '/vendor/wp-phpunit/wp-phpunit';
}

if ( ! file_exists( $_tests_dir . '/includes/functions.php' ) ) {
	echo "Could not find {$_tests_dir}/includes/functions.php\n";
	echo "Run composer install, then use pnpm test:php.\n";
	exit( 1 );
}

if ( file_exists( dirname( __DIR__ ) . '/vendor/autoload.php' ) ) {
	require_once dirname( __DIR__ ) . '/vendor/autoload.php';
}

require_once dirname( __DIR__ ) . '/includes/class-autoloader.php';
require_once $_tests_dir . '/includes/functions.php';

/**
 * Load the plugin in the test suite.
 *
 * @return void
 */
function _aggressive_blocks_manually_load_environment(): void {
	$plugin_dir = dirname( __DIR__ );

	if ( ! defined( 'AGGRESSIVE_BLOCKS_VERSION' ) ) {
		define( 'AGGRESSIVE_BLOCKS_VERSION', '1.0.0' );
	}
	if ( ! defined( 'AGGRESSIVE_BLOCKS_FILE' ) ) {
		define( 'AGGRESSIVE_BLOCKS_FILE', $plugin_dir . '/aggressive-blocks.php' );
	}
	if ( ! defined( 'AGGRESSIVE_BLOCKS_DIR' ) ) {
		define( 'AGGRESSIVE_BLOCKS_DIR', $plugin_dir . '/' );
	}
	if ( ! defined( 'AGGRESSIVE_BLOCKS_URI' ) ) {
		define( 'AGGRESSIVE_BLOCKS_URI', 'http://example.org/wp-content/plugins/aggressive-blocks/' );
	}
	if ( ! defined( 'AGGRESSIVE_BLOCKS_TEXT_DOMAIN' ) ) {
		define( 'AGGRESSIVE_BLOCKS_TEXT_DOMAIN', 'aggressive-blocks' );
	}

	new Aggressive_Blocks\Autoloader();
	require_once $plugin_dir . '/includes/helpers.php';
	Aggressive_Blocks\Plugin::init();
}
tests_add_filter( 'muplugins_loaded', '_aggressive_blocks_manually_load_environment' );

require $_tests_dir . '/includes/bootstrap.php';
