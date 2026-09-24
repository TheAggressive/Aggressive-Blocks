<?php
/**
 * Disposable database configuration for the WordPress test suite.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

/**
 * Read a local test override.
 *
 * @param string $name    Environment variable.
 * @param string $default Default value.
 * @return string
 */
function aggressive_blocks_tests_env( string $name, string $default ): string {
	$value = getenv( $name );

	return is_string( $value ) && '' !== $value ? $value : $default;
}

define( 'ABSPATH', rtrim( aggressive_blocks_tests_env( 'AA_TESTS_ABSPATH', '/var/www/html' ), '/' ) . '/' );
define( 'WP_DEFAULT_THEME', 'default' );
define( 'WP_DEBUG', true );
define( 'DB_NAME', aggressive_blocks_tests_env( 'AA_TESTS_DB_NAME', 'wordpress_test' ) );
define( 'DB_USER', aggressive_blocks_tests_env( 'AA_TESTS_DB_USER', 'wordpress' ) );
define( 'DB_PASSWORD', aggressive_blocks_tests_env( 'AA_TESTS_DB_PASSWORD', 'wordpress' ) );
define( 'DB_HOST', aggressive_blocks_tests_env( 'AA_TESTS_DB_HOST', 'database' ) );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );
define( 'FS_METHOD', 'direct' );

define( 'AUTH_KEY', 'aggressive-blocks-tests-auth' );
define( 'SECURE_AUTH_KEY', 'aggressive-blocks-tests-secure-auth' );
define( 'LOGGED_IN_KEY', 'aggressive-blocks-tests-logged-in' );
define( 'NONCE_KEY', 'aggressive-blocks-tests-nonce' );
define( 'AUTH_SALT', 'aggressive-blocks-tests-auth-salt' );
define( 'SECURE_AUTH_SALT', 'aggressive-blocks-tests-secure-auth-salt' );
define( 'LOGGED_IN_SALT', 'aggressive-blocks-tests-logged-in-salt' );
define( 'NONCE_SALT', 'aggressive-blocks-tests-nonce-salt' );

$table_prefix = 'wptests_';

define( 'WP_TESTS_DOMAIN', 'example.test' );
define( 'WP_TESTS_EMAIL', 'admin@example.test' );
define( 'WP_TESTS_TITLE', 'Aggressive Blocks Tests' );
define( 'WP_PHP_BINARY', 'php' );
define( 'WPLANG', '' );
