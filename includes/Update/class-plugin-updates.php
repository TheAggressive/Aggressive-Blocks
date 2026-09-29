<?php
/**
 * WordPress plugin update integration.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Update;

/**
 * Offers verified GitHub releases through WordPress's own plugin updates.
 *
 * The plugin header's Update URI points at the GitHub repository, so
 * WordPress never asks WordPress.org about this plugin and instead calls
 * update_plugins_github.com. This answers it with the newest stable release.
 * WordPress then shows the update, installs it, and applies auto-update
 * settings as it does for any plugin. The package is checked against the
 * release's SHA-256 checksum before it is unpacked.
 */
final class Plugin_Updates {

	/** The Update URI in the plugin header. */
	public const UPDATE_URI = 'https://github.com/TheAggressive/Aggressive-Blocks';

	/** Plugin slug and directory. */
	private const SLUG = 'aggressive-blocks';

	/** Environments where a self-update is never wanted. */
	private const DEVELOPMENT_ENVIRONMENTS = array( 'local', 'development' );

	/**
	 * Release metadata.
	 *
	 * @var Release_Repository
	 */
	private Release_Repository $releases;

	/**
	 * Package verification.
	 *
	 * @var Package_Verifier
	 */
	private Package_Verifier $packages;

	/**
	 * Constructor.
	 *
	 * @param Release_Repository $releases Release metadata.
	 * @param Package_Verifier   $packages Package verification.
	 */
	public function __construct( Release_Repository $releases, Package_Verifier $packages ) {
		$this->releases = $releases;
		$this->packages = $packages;
	}

	/**
	 * Build the updater and hook it when it may run.
	 *
	 * @return void
	 */
	public static function register(): void {
		$http     = new Update_Http_Client();
		$releases = new Release_Repository( $http );

		( new self( $releases, new Package_Verifier( $releases, $http ) ) )->init();
	}

	/**
	 * The enablement policy, with no WordPress in it.
	 *
	 * @param bool   $is_checkout       Whether the plugin root is a checkout.
	 * @param string $environment       WordPress environment type.
	 * @param bool   $file_mods_allowed Whether WordPress may modify files.
	 * @return bool
	 */
	public static function should_enable( bool $is_checkout, string $environment, bool $file_mods_allowed ): bool {
		return ! $is_checkout
			&& $file_mods_allowed
			&& ! in_array( $environment, self::DEVELOPMENT_ENVIRONMENTS, true );
	}

	/**
	 * Whether the updater may run on this install.
	 *
	 * Three independent signals turn it off:
	 *
	 *  - A checkout. WordPress installs an update by emptying the plugin
	 *    directory and unpacking the release ZIP, which holds none of the
	 *    repository, so an update would delete the checkout and its history.
	 *    `.git` is tested with file_exists(): in a worktree or submodule it is
	 *    a file, not a directory.
	 *  - A local or development environment type, which a site owner sets on
	 *    purpose (unset, it defaults to production, so it cannot be the only
	 *    signal).
	 *  - File modifications disallowed (DISALLOW_FILE_MODS, as on WordPress VIP
	 *    and code-deployed hosts). No update could be installed, so none is
	 *    looked up, and the plugin makes no remote requests at all.
	 *
	 * @return bool
	 */
	public static function is_enabled(): bool {
		$is_checkout       = file_exists( AGGRESSIVE_BLOCKS_DIR . '.git' );
		$environment       = wp_get_environment_type();
		$file_mods_allowed = wp_is_file_mod_allowed( 'aggressive_blocks_updates' );

		/**
		 * Filters whether the GitHub updater is active.
		 *
		 * Returning false unhooks it entirely: no update is looked up or
		 * offered, and no package can be installed over this plugin.
		 *
		 * @param bool   $enabled           Whether the updater may run.
		 * @param bool   $is_checkout       Whether the plugin root is a checkout.
		 * @param string $environment       WordPress environment type.
		 * @param bool   $file_mods_allowed Whether WordPress may modify files.
		 */
		return (bool) apply_filters(
			'aggressive_blocks_enable_updates',
			self::should_enable( $is_checkout, $environment, $file_mods_allowed ),
			$is_checkout,
			$environment,
			$file_mods_allowed
		);
	}

	/**
	 * Attach the updater's hooks when it may run.
	 *
	 * Nothing is hooked otherwise, rather than each callback returning early,
	 * so no path can verify and hand WordPress a package for a directory this
	 * must never overwrite.
	 *
	 * @return void
	 */
	public function init(): void {
		if ( ! self::is_enabled() ) {
			return;
		}

		add_filter( 'update_plugins_github.com', array( $this, 'update' ), 10, 3 );
		add_filter( 'plugins_api', array( $this, 'plugin_information' ), 10, 3 );
		// Last, so the file it verifies is the file WordPress installs.
		add_filter( 'upgrader_pre_download', array( $this, 'verify_download' ), PHP_INT_MAX, 2 );
		add_action( 'upgrader_process_complete', array( $this, 'clear_after_update' ), 10, 2 );
	}

	/**
	 * Answer WordPress's update check for this plugin.
	 *
	 * An update carries a package only when a newer release has its exact ZIP
	 * and a valid checksum. Otherwise WordPress records the plugin as current.
	 *
	 * @param mixed                $update      Result of earlier callbacks.
	 * @param array<string, mixed> $plugin_data Installed plugin headers.
	 * @param string               $plugin_file Plugin basename.
	 * @return mixed
	 */
	public function update( $update, array $plugin_data, string $plugin_file ) {
		if ( plugin_basename( AGGRESSIVE_BLOCKS_FILE ) !== $plugin_file || self::UPDATE_URI !== ( $plugin_data['UpdateURI'] ?? null ) ) {
			return $update;
		}

		$release = $this->releases->latest();
		$version = is_array( $release ) ? $this->releases->version( $release ) : null;
		if ( ! is_array( $release ) || null === $version ) {
			return $update;
		}

		$item = array(
			'slug'    => self::SLUG,
			'version' => $version,
			'url'     => $this->releases->repository_url(),
		);

		$installed = is_string( $plugin_data['Version'] ?? null ) ? $plugin_data['Version'] : AGGRESSIVE_BLOCKS_VERSION;
		if ( ! version_compare( $version, $installed, '>' ) ) {
			return $item;
		}

		$package = $this->releases->package_url( $release );
		if ( false === $package || false === $this->packages->checksum( $package, $release ) ) {
			return $update;
		}

		return array_merge( $item, array( 'package' => $package ), $this->releases->requirements( $release ) );
	}

	/**
	 * Verify our package before WordPress installs it.
	 *
	 * @param false|\WP_Error|string $reply   Result of earlier callbacks.
	 * @param mixed                  $package Package URL.
	 * @return false|\WP_Error|string
	 */
	public function verify_download( $reply, $package ) {
		return $this->packages->verify_download( $reply, $package );
	}

	/**
	 * Release details for WordPress's "View details" dialog.
	 *
	 * @param mixed  $result Result of earlier callbacks.
	 * @param string $action plugins_api action.
	 * @param mixed  $args   plugins_api arguments.
	 * @return mixed
	 */
	public function plugin_information( $result, string $action, $args ) {
		if ( 'plugin_information' !== $action || ! is_object( $args ) || self::SLUG !== ( $args->slug ?? null ) ) {
			return $result;
		}

		$release = $this->releases->latest();
		$version = is_array( $release ) ? $this->releases->version( $release ) : null;
		if ( ! is_array( $release ) || null === $version ) {
			return $result;
		}

		$package   = $this->releases->package_url( $release );
		$published = $release['published_at'] ?? '';
		$notes     = $release['body'] ?? '';

		return (object) array_merge(
			array(
				'name'              => 'Aggressive Blocks',
				'slug'              => self::SLUG,
				'version'           => $version,
				'author'            => 'The Aggressive Network, LLC',
				'homepage'          => $this->releases->repository_url(),
				'last_updated'      => is_string( $published ) ? $published : '',
				'short_description' => __( 'Reusable Gutenberg blocks extracted from Aggressive Apparel.', 'aggressive-blocks' ),
				'sections'          => array(
					'description' => esc_html__( 'Reusable Gutenberg blocks extracted from Aggressive Apparel. Updates come from verified GitHub releases.', 'aggressive-blocks' ),
					// Release notes are Markdown from GitHub; show them as text.
					'changelog'   => is_string( $notes ) && '' !== trim( $notes )
						? nl2br( esc_html( $notes ) )
						: esc_html__( 'No release notes were published.', 'aggressive-blocks' ),
				),
				'download_link'     => false === $package ? '' : $package,
			),
			$this->releases->requirements( $release )
		);
	}

	/**
	 * Forget cached release data once this plugin has been updated.
	 *
	 * @param mixed                $upgrader Core upgrader.
	 * @param array<string, mixed> $options  Completed operation.
	 * @return void
	 */
	public function clear_after_update( $upgrader, array $options ): void {
		unset( $upgrader );

		$plugins = $options['plugins'] ?? array();
		if (
			'update' !== ( $options['action'] ?? null )
			|| 'plugin' !== ( $options['type'] ?? null )
			|| ! is_array( $plugins )
			|| ! in_array( plugin_basename( AGGRESSIVE_BLOCKS_FILE ), $plugins, true )
		) {
			return;
		}

		$this->releases->flush();
		$this->packages->flush();
	}
}
