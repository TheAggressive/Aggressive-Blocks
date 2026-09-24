<?php
/**
 * Script translation and shared module registration.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Assets;

/**
 * Registers script modules and Jed translations.
 */
class Asset_Loader {

	/**
	 * Plugin text domain.
	 */
	public const TEXT_DOMAIN = 'aggressive-blocks';

	/**
	 * Languages directory path.
	 *
	 * @return string
	 */
	public static function languages_path(): string {
		return AGGRESSIVE_BLOCKS_DIR . 'languages';
	}

	/**
	 * Register Jed JSON translations for a classic script handle.
	 *
	 * @param string $handle Registered script handle.
	 * @return void
	 */
	public static function set_script_translations( string $handle ): void {
		if ( '' === $handle || ! function_exists( 'wp_set_script_translations' ) ) {
			return;
		}

		wp_set_script_translations(
			$handle,
			self::TEXT_DOMAIN,
			self::languages_path()
		);
	}

	/**
	 * Read a webpack .asset.php sidecar.
	 *
	 * @param string $asset_path Path relative to plugin root, without extension.
	 * @return array{dependencies: array<int, mixed>, version: string}
	 */
	public static function get_asset_data( string $asset_path ): array {
		$asset_file = AGGRESSIVE_BLOCKS_DIR . $asset_path . '.asset.php';

		if ( ! file_exists( $asset_file ) ) {
			return array(
				'dependencies' => array(),
				'version'      => AGGRESSIVE_BLOCKS_VERSION,
			);
		}

		$data = include $asset_file;
		if ( ! is_array( $data ) ) {
			return array(
				'dependencies' => array(),
				'version'      => AGGRESSIVE_BLOCKS_VERSION,
			);
		}

		return array(
			'dependencies' => isset( $data['dependencies'] ) && is_array( $data['dependencies'] )
				? $data['dependencies']
				: array(),
			'version'      => isset( $data['version'] ) ? (string) $data['version'] : AGGRESSIVE_BLOCKS_VERSION,
		);
	}

	/**
	 * Register a compiled script module.
	 *
	 * @param string            $module_id          Module identifier.
	 * @param string            $relative_path      Path relative to plugin root, without extension.
	 * @param array<int, mixed> $deps               Additional module dependencies.
	 * @param bool              $with_interactivity Whether to depend on @wordpress/interactivity.
	 * @return bool
	 */
	public static function register_interactivity_module( string $module_id, string $relative_path, array $deps = array(), bool $with_interactivity = true ): bool {
		if ( ! function_exists( 'wp_register_script_module' ) ) {
			return false;
		}

		$file = AGGRESSIVE_BLOCKS_DIR . $relative_path . '.js';
		if ( ! file_exists( $file ) ) {
			return false;
		}

		$asset_data = self::get_asset_data( $relative_path );

		if ( $with_interactivity && ! in_array( '@wordpress/interactivity', $deps, true ) ) {
			array_unshift( $deps, '@wordpress/interactivity' );
		}

		$merged_deps = array_values(
			array_unique(
				array_merge( $asset_data['dependencies'], $deps ),
				SORT_REGULAR
			)
		);

		wp_register_script_module(
			$module_id,
			AGGRESSIVE_BLOCKS_URI . $relative_path . '.js',
			$merged_deps,
			(string) $asset_data['version']
		);

		return true;
	}
}
