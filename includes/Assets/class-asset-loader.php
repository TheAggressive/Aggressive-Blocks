<?php
/**
 * Script translations.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Assets;

/**
 * Registers Jed translations for block scripts.
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
}
