<?php
/**
 * Block discovery and registration.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Blocks;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers plugin block types from built metadata.
 */
class Blocks {

	/**
	 * Build directories to scan (relative to the plugin root).
	 *
	 * @var array<string>
	 */
	private const BUILD_DIRS = array(
		'build/blocks',
		'build/blocks-interactivity',
	);

	/**
	 * Canonical block namespace prefix.
	 */
	public const BLOCK_NAMESPACE = 'aggressive-blocks/';

	/**
	 * Hook registration.
	 *
	 * @return void
	 */
	public static function init(): void {
		add_action( 'init', array( self::class, 'register' ) );
	}

	/**
	 * Discover and register all plugin blocks.
	 *
	 * @return void
	 */
	public static function register(): void {
		if ( ! function_exists( 'register_block_type_from_metadata' ) ) {
			return;
		}

		try {
			self::register_metadata_collection();

			foreach ( self::BUILD_DIRS as $build_dir ) {
				$full_build_dir = self::get_build_directory( $build_dir );

				if ( '' === $full_build_dir || ! is_dir( $full_build_dir ) || ! is_readable( $full_build_dir ) ) {
					continue;
				}

				self::register_blocks_from_directories( self::get_block_directories( $full_build_dir ) );
			}
		} catch ( \Throwable $e ) {
			self::debug_log(
				'Blocks registration error.',
				array( 'error' => $e->getMessage() )
			);
		}
	}

	/**
	 * Register the pre-compiled block metadata manifest (WP 6.7+).
	 *
	 * @return void
	 */
	private static function register_metadata_collection(): void {
		if ( ! function_exists( 'wp_register_block_metadata_collection' ) ) {
			return;
		}

		$build_path = AGGRESSIVE_BLOCKS_DIR . 'build';
		$manifest   = $build_path . '/blocks-manifest.php';

		if ( ! file_exists( $manifest ) ) {
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				self::debug_log( 'build/blocks-manifest.php missing; run `pnpm build` or `pnpm build:manifest`.' );
			}
			return;
		}

		wp_register_block_metadata_collection( $build_path, $manifest );
	}

	/**
	 * Full path to a build directory.
	 *
	 * @param string $build_dir Relative build directory.
	 * @return string Trailing-slash path, or empty on failure.
	 */
	private static function get_build_directory( string $build_dir ): string {
		$plugin_dir = rtrim( AGGRESSIVE_BLOCKS_DIR, '/\\' );
		$build_dir  = trim( $build_dir, '/\\' );

		return $plugin_dir . '/' . $build_dir . '/';
	}

	/**
	 * Immediate readable subdirectories of a build folder.
	 *
	 * @param string $build_dir Build directory path.
	 * @return array<string>
	 */
	private static function get_block_directories( string $build_dir ): array {
		$dirs = glob( rtrim( $build_dir, '/' ) . '/*', GLOB_ONLYDIR );
		if ( ! is_array( $dirs ) ) {
			return array();
		}

		return array_values( array_filter( $dirs, 'is_readable' ) );
	}

	/**
	 * Register each block directory that contains block.json.
	 *
	 * @param array<string> $block_directories Directory paths.
	 * @return void
	 */
	private static function register_blocks_from_directories( array $block_directories ): void {
		foreach ( $block_directories as $block_location ) {
			$block_json = $block_location . '/block.json';

			if ( ! file_exists( $block_json ) || ! is_readable( $block_json ) ) {
				continue;
			}

			if ( ! self::block_required_plugins_active( $block_json ) ) {
				continue;
			}

			try {
				$block_type = register_block_type_from_metadata( $block_location );
				if ( $block_type instanceof \WP_Block_Type ) {
					self::set_block_script_translations( $block_type );
				}
			} catch ( \Throwable $e ) {
				self::debug_log(
					'Block registration error.',
					array(
						'block' => $block_location,
						'error' => $e->getMessage(),
					)
				);
			}
		}
	}

	/**
	 * Wire classic script handles to plugin translations.
	 *
	 * @param \WP_Block_Type $block_type Registered block type.
	 * @return void
	 */
	private static function set_block_script_translations( \WP_Block_Type $block_type ): void {
		$handle_groups = array(
			$block_type->editor_script_handles,
			$block_type->script_handles,
			$block_type->view_script_handles,
		);

		foreach ( $handle_groups as $handles ) {
			foreach ( (array) $handles as $handle ) {
				if ( is_string( $handle ) && '' !== $handle ) {
					\Aggressive_Blocks\Assets\Asset_Loader::set_script_translations( $handle );
				}
			}
		}
	}

	/**
	 * Whether supports.requiresPlugins dependencies are satisfied.
	 *
	 * @param string $block_json Absolute path to block.json.
	 * @return bool
	 */
	private static function block_required_plugins_active( string $block_json ): bool {
		if ( ! function_exists( 'wp_json_file_decode' ) ) {
			return true;
		}

		$metadata = wp_json_file_decode( $block_json, array( 'associative' => true ) );

		return is_array( $metadata ) ? self::metadata_required_plugins_active( $metadata ) : true;
	}

	/**
	 * Evaluate supports.requiresPlugins from decoded metadata.
	 *
	 * @param array<string, mixed> $metadata Decoded block.json.
	 * @return bool
	 */
	private static function metadata_required_plugins_active( array $metadata ): bool {
		$required = $metadata['supports']['requiresPlugins'] ?? null;

		if ( ! is_array( $required ) || array() === $required ) {
			return true;
		}

		foreach ( $required as $plugin ) {
			if ( ! is_string( $plugin ) || '' === $plugin ) {
				continue;
			}

			if ( ! self::is_required_plugin_active( $plugin ) ) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Whether a requiresPlugins slug is active.
	 *
	 * @param string $plugin Plugin slug.
	 * @return bool
	 */
	private static function is_required_plugin_active( string $plugin ): bool {
		if ( 'woocommerce' === $plugin ) {
			return class_exists( 'WooCommerce' );
		}

		return (bool) apply_filters( 'aggressive_blocks_required_plugin_active', false, $plugin );
	}

	/**
	 * Whether a block is registered.
	 *
	 * @param string $block_name Block name.
	 * @return bool
	 */
	public static function is_block_registered( string $block_name ): bool {
		return \WP_Block_Type_Registry::get_instance()->is_registered( $block_name );
	}

	/**
	 * Registered plugin block names.
	 *
	 * @return array<string>
	 */
	public static function get_registered_blocks(): array {
		$blocks   = array();
		$registry = \WP_Block_Type_Registry::get_instance();

		foreach ( $registry->get_all_registered() as $block_name => $block_type ) {
			if ( str_starts_with( $block_type->name, self::BLOCK_NAMESPACE ) ) {
				$blocks[] = $block_name;
			}
		}

		return $blocks;
	}

	/**
	 * Whether any built block directory exists.
	 *
	 * @return bool
	 */
	public static function blocks_available(): bool {
		foreach ( self::BUILD_DIRS as $build_dir ) {
			$full_build_dir = self::get_build_directory( $build_dir );
			if ( ! is_dir( $full_build_dir ) ) {
				continue;
			}

			$files = scandir( $full_build_dir );
			if ( is_array( $files ) && count( $files ) > 2 ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Write a diagnostic when WP_DEBUG is on.
	 *
	 * @param string               $message Message.
	 * @param array<string, mixed> $context Context.
	 * @return void
	 */
	private static function debug_log( string $message, array $context = array() ): void {
		if ( ! ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ) {
			return;
		}

		$line = '[Aggressive Blocks] ' . $message;
		if ( array() !== $context ) {
			$encoded = wp_json_encode( $context );
			if ( is_string( $encoded ) ) {
				$line .= ' ' . $encoded;
			}
		}

		wp_trigger_error( __FUNCTION__, $line, E_USER_NOTICE );
	}
}
