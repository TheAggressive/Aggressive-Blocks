<?php
/**
 * Plugin Name:       Aggressive Blocks
 * Plugin URI:        https://github.com/TheAggressive/Aggressive-Apparel
 * Description:       Reusable Gutenberg blocks extracted from Aggressive Apparel.
 * Version:           1.0.0
 * Requires at least: 7.0
 * Requires PHP:      8.2
 * Author:            The Aggressive Network, LLC
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       aggressive-blocks
 * Domain Path:       /languages
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AGGRESSIVE_BLOCKS_VERSION', '1.0.0' );
define( 'AGGRESSIVE_BLOCKS_FILE', __FILE__ );
define( 'AGGRESSIVE_BLOCKS_DIR', plugin_dir_path( __FILE__ ) );
define( 'AGGRESSIVE_BLOCKS_URI', plugin_dir_url( __FILE__ ) );
define( 'AGGRESSIVE_BLOCKS_TEXT_DOMAIN', 'aggressive-blocks' );

require_once AGGRESSIVE_BLOCKS_DIR . 'includes/class-autoloader.php';
require_once AGGRESSIVE_BLOCKS_DIR . 'includes/helpers.php';

new Aggressive_Blocks\Autoloader();

Aggressive_Blocks\Plugin::init();
