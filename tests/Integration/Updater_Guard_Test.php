<?php
/**
 * The guards that keep the updater off where an update must never run.
 *
 * @package Aggressive_Blocks\Tests\Integration
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Integration;

use Aggressive_Blocks\Update\Package_Verifier;
use Aggressive_Blocks\Update\Plugin_Updates;
use Aggressive_Blocks\Update\Release_Repository;
use Aggressive_Blocks\Update\Update_Http_Client;
use WP_UnitTestCase;

/**
 * An update empties the plugin directory and unpacks the release ZIP, which
 * holds none of the repository, so these assert the guards, not the update.
 */
class Updater_Guard_Test extends WP_UnitTestCase {

	/**
	 * Remove overrides.
	 *
	 * @return void
	 */
	public function tear_down(): void {
		remove_all_filters( 'aggressive_blocks_enable_updates' );
		remove_all_filters( 'file_mod_allowed' );

		parent::tear_down();
	}

	/**
	 * Every combination of the three signals.
	 *
	 * @dataProvider policy_cases
	 *
	 * @param bool   $is_checkout       Checkout.
	 * @param string $environment       Environment type.
	 * @param bool   $file_mods_allowed File mods allowed.
	 * @param bool   $expected          Enabled.
	 * @return void
	 */
	public function test_policy( bool $is_checkout, string $environment, bool $file_mods_allowed, bool $expected ): void {
		$this->assertSame( $expected, Plugin_Updates::should_enable( $is_checkout, $environment, $file_mods_allowed ) );
	}

	/**
	 * Policy cases.
	 *
	 * @return array<string, array{0: bool, 1: string, 2: bool, 3: bool}>
	 */
	public function policy_cases(): array {
		return array(
			'installed, production'        => array( false, 'production', true, true ),
			'installed, staging'           => array( false, 'staging', true, true ),
			'installed, development'       => array( false, 'development', true, false ),
			'installed, local'             => array( false, 'local', true, false ),
			'checkout, production'         => array( true, 'production', true, false ),
			'file mods off (VIP)'          => array( false, 'production', false, false ),
			'checkout, file mods off'      => array( true, 'production', false, false ),
		);
	}

	/**
	 * The suite runs from a checkout, which is the case being guarded.
	 *
	 * Asserted first: on an install without `.git`, every test below would
	 * pass for the wrong reason.
	 *
	 * @return void
	 */
	public function test_the_suite_runs_from_a_checkout(): void {
		$this->assertFileExists( AGGRESSIVE_BLOCKS_DIR . '.git' );
	}

	/**
	 * A checkout registers no updater hook at all.
	 *
	 * @return void
	 */
	public function test_a_checkout_registers_no_hooks(): void {
		$updates = $this->updater();
		$updates->init();

		$this->assertFalse( Plugin_Updates::is_enabled() );
		$this->assertFalse( has_filter( 'update_plugins_github.com', array( $updates, 'update' ) ) );
		$this->assertFalse( has_filter( 'upgrader_pre_download', array( $updates, 'verify_download' ) ) );
		$this->assertFalse( has_filter( 'plugins_api', array( $updates, 'plugin_information' ) ) );
		$this->assertFalse( has_action( 'upgrader_process_complete', array( $updates, 'clear_after_update' ) ) );
	}

	/**
	 * Disallowed file modifications win over the filter's default.
	 *
	 * @return void
	 */
	public function test_disallowed_file_mods_disable_it(): void {
		add_filter( 'file_mod_allowed', '__return_false' );
		add_filter(
			'aggressive_blocks_enable_updates',
			static fn( bool $enabled, bool $is_checkout, string $environment, bool $file_mods ) => Plugin_Updates::should_enable( false, $environment, $file_mods ),
			10,
			4
		);

		$this->assertFalse( Plugin_Updates::is_enabled() );
	}

	/**
	 * The filter can turn it on for someone who knows why, and then every
	 * hook is registered.
	 *
	 * @return void
	 */
	public function test_the_filter_enables_every_hook(): void {
		add_filter( 'aggressive_blocks_enable_updates', '__return_true' );
		$updates = $this->updater();
		$updates->init();

		$this->assertSame( 10, has_filter( 'update_plugins_github.com', array( $updates, 'update' ) ) );
		$this->assertSame( PHP_INT_MAX, has_filter( 'upgrader_pre_download', array( $updates, 'verify_download' ) ) );
		$this->assertSame( 10, has_filter( 'plugins_api', array( $updates, 'plugin_information' ) ) );
		$this->assertSame( 10, has_action( 'upgrader_process_complete', array( $updates, 'clear_after_update' ) ) );

		remove_filter( 'update_plugins_github.com', array( $updates, 'update' ) );
		remove_filter( 'upgrader_pre_download', array( $updates, 'verify_download' ), PHP_INT_MAX );
		remove_filter( 'plugins_api', array( $updates, 'plugin_information' ) );
		remove_action( 'upgrader_process_complete', array( $updates, 'clear_after_update' ) );
	}

	/**
	 * The plugin header routes updates to this updater, and away from
	 * WordPress.org, where anyone could publish the slug.
	 *
	 * @return void
	 */
	public function test_the_header_declares_the_update_uri(): void {
		$headers = get_file_data( AGGRESSIVE_BLOCKS_FILE, array( 'UpdateURI' => 'Update URI' ) );

		$this->assertSame( Plugin_Updates::UPDATE_URI, $headers['UpdateURI'] );
		$this->assertSame( 'github.com', wp_parse_url( $headers['UpdateURI'], PHP_URL_HOST ) );
	}

	/**
	 * A real updater with real collaborators.
	 *
	 * @return Plugin_Updates
	 */
	private function updater(): Plugin_Updates {
		$http     = new Update_Http_Client();
		$releases = new Release_Repository( $http );

		return new Plugin_Updates( $releases, new Package_Verifier( $releases, $http ) );
	}
}
