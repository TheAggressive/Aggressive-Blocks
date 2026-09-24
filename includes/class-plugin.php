<?php
/**
 * Plugin bootstrap.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks;

/**
 * Wires registration, icons, copyright editor data, and CLI.
 */
class Plugin {

	/**
	 * Hook plugin services.
	 *
	 * @return void
	 */
	public static function init(): void {
		add_action( 'init', array( self::class, 'load_textdomain' ), 0 );
		add_action( 'init', array( self::class, 'register_shared_modules' ), 5 );

		Core\Block_Categories::init();
		Core\Brand_Icons::init();
		Blocks\Blocks::init();
		Blocks\Icon_Block::init();
		Blocks\Copyright::init();
		Blocks\Aliases::init();

		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			Migration\Cli::register();
		}
	}

	/**
	 * Load plugin translations.
	 *
	 * @return void
	 */
	public static function load_textdomain(): void {
		load_plugin_textdomain(
			'aggressive-blocks',
			false,
			dirname( plugin_basename( AGGRESSIVE_BLOCKS_FILE ) ) . '/languages'
		);
	}

	/**
	 * Register shared script modules used by interactivity blocks.
	 *
	 * @return void
	 */
	public static function register_shared_modules(): void {
		Assets\Asset_Loader::register_interactivity_module(
			'@aggressive-blocks/helpers',
			'build/interactivity/helpers',
			array(),
			false
		);
		Assets\Asset_Loader::register_interactivity_module(
			'@aggressive-blocks/scroll-lock',
			'build/interactivity/scroll-lock',
			array(),
			false
		);
	}
}
