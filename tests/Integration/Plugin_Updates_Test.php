<?php
/**
 * The GitHub updater against WordPress's HTTP API, with GitHub mocked.
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
 * The updater offers only exact, checksummed, stable releases, and installs
 * only a package whose bytes match.
 */
class Plugin_Updates_Test extends WP_UnitTestCase {

	private const BASE = 'https://github.com/TheAggressive/Aggressive-Blocks/releases/download';

	/**
	 * Releases.
	 *
	 * @var Release_Repository
	 */
	private Release_Repository $releases;

	/**
	 * Package verifier.
	 *
	 * @var Package_Verifier
	 */
	private Package_Verifier $packages;

	/**
	 * Updater.
	 *
	 * @var Plugin_Updates
	 */
	private Plugin_Updates $updates;

	/**
	 * Every URL the mock was asked for, in order.
	 *
	 * @var array<int, string>
	 */
	private array $requests = array();

	/**
	 * Fresh collaborators and caches for each test.
	 *
	 * @return void
	 */
	public function set_up(): void {
		parent::set_up();

		$http           = new Update_Http_Client();
		$this->releases = new Release_Repository( $http );
		$this->packages = new Package_Verifier( $this->releases, $http );
		$this->updates  = new Plugin_Updates( $this->releases, $this->packages );
		$this->releases->flush();
		$this->packages->flush();
		$this->requests = array();
	}

	/**
	 * Remove the HTTP mock and caches.
	 *
	 * @return void
	 */
	public function tear_down(): void {
		remove_all_filters( 'pre_http_request' );
		$this->releases->flush();
		$this->packages->flush();

		parent::tear_down();
	}

	/**
	 * A newer release with both assets is offered, with its readme's
	 * requirements.
	 *
	 * @return void
	 */
	public function test_offers_a_newer_checksummed_release_with_its_requirements(): void {
		$this->mock_github( array( $this->release( '2.4.0' ) ) );

		$update = $this->updates->update( false, $this->installed( '2.3.0' ), $this->plugin_file() );

		$this->assertIsArray( $update );
		$this->assertSame( '2.4.0', $update['version'] );
		$this->assertSame( self::BASE . '/v2.4.0/aggressive-blocks-2.4.0.zip', $update['package'] );
		$this->assertSame( 'aggressive-blocks', $update['slug'] );
		$this->assertSame( '7.0', $update['requires'] );
		$this->assertSame( '7.1', $update['tested'] );
		$this->assertSame( '8.2', $update['requires_php'] );
	}

	/**
	 * When the installed version is current, WordPress gets the release
	 * without a package, and no checksum is fetched.
	 *
	 * @return void
	 */
	public function test_reports_current_without_a_package_or_extra_requests(): void {
		$this->mock_github( array( $this->release( '2.4.0' ) ) );

		$update = $this->updates->update( false, $this->installed( '2.4.0' ), $this->plugin_file() );

		$this->assertIsArray( $update );
		$this->assertArrayNotHasKey( 'package', $update );
		$this->assertCount( 1, $this->requests, 'Only the release list is fetched.' );
	}

	/**
	 * A release without its checksum is not offered at all.
	 *
	 * @return void
	 */
	public function test_a_release_without_a_checksum_is_not_offered(): void {
		$release           = $this->release( '2.4.0' );
		$release['assets'] = array_slice( $release['assets'], 0, 1 );
		$this->mock_github( array( $release ) );

		$this->assertFalse( $this->updates->update( false, $this->installed( '2.3.0' ), $this->plugin_file() ) );
	}

	/**
	 * Drafts, prereleases, and malformed tags never outrank a stable release.
	 *
	 * @return void
	 */
	public function test_selects_the_highest_stable_release(): void {
		$draft                    = $this->release( '9.0.0' );
		$draft['draft']           = true;
		$prerelease               = $this->release( '8.0.0' );
		$prerelease['prerelease'] = true;
		$malformed                = $this->release( '7.0.0' );
		$malformed['tag_name']    = 'release-7.0.0';
		$this->mock_github( array( $draft, $prerelease, $malformed, $this->release( '2.9.0' ), $this->release( '2.10.0' ) ) );

		$release = $this->releases->latest();

		$this->assertIsArray( $release );
		$this->assertSame( '2.10.0', $this->releases->version( $release ) );
	}

	/**
	 * The github.com hook is shared with every plugin whose Update URI is on
	 * GitHub; others pass through untouched and trigger no request.
	 *
	 * @return void
	 */
	public function test_leaves_other_github_plugins_alone(): void {
		$this->mock_github( array( $this->release( '2.4.0' ) ) );
		$theirs = array(
			'Version'   => '1.0.0',
			'UpdateURI' => 'https://github.com/someone/else',
		);

		$this->assertSame( 'theirs', $this->updates->update( 'theirs', $theirs, 'else/else.php' ) );
		$this->assertSame(
			'theirs',
			$this->updates->update( 'theirs', array( 'UpdateURI' => 'https://github.com/someone/else' ) + $this->installed( '1.0.0' ), $this->plugin_file() )
		);
		$this->assertSame( array(), $this->requests );
	}

	/**
	 * A GitHub outage costs one request per window, and the last good release
	 * is still offered.
	 *
	 * @return void
	 */
	public function test_backs_off_after_a_failed_lookup_and_keeps_the_last_release(): void {
		$this->mock_github( array( $this->release( '2.4.0' ) ) );
		$this->assertIsArray( $this->releases->latest() );

		// Expire the fresh window, then take GitHub down.
		$cached               = get_site_transient( Release_Repository::CACHE_KEY );
		$cached['checked_at'] = time() - HOUR_IN_SECONDS;
		set_site_transient( Release_Repository::CACHE_KEY, $cached, DAY_IN_SECONDS );
		remove_all_filters( 'pre_http_request' );
		$this->requests = array();
		$this->mock_http(
			function ( string $url ) {
				$this->requests[] = $url;
				return new \WP_Error( 'http_request_failed', 'GitHub is down' );
			}
		);

		$first  = $this->releases->latest();
		$second = $this->releases->latest();

		$this->assertIsArray( $first );
		$this->assertSame( '2.4.0', $this->releases->version( $first ) );
		$this->assertSame( $first, $second );
		$this->assertCount( 1, $this->requests, 'The failure is cached for the window.' );
	}

	/**
	 * Only the exact asset of this repository, for its own tag, is trusted.
	 *
	 * @dataProvider untrusted_package_urls
	 *
	 * @param string $url Candidate URL.
	 * @return void
	 */
	public function test_rejects_untrusted_package_urls( string $url ): void {
		$this->assertFalse( $this->releases->is_allowed_package_url( $url ) );
	}

	/**
	 * Untrusted package URLs.
	 *
	 * @return array<string, array{0: string}>
	 */
	public function untrusted_package_urls(): array {
		$good = '/TheAggressive/Aggressive-Blocks/releases/download/v2.4.0/aggressive-blocks-2.4.0.zip';

		return array(
			'plain http'      => array( 'http://github.com' . $good ),
			'lookalike host'  => array( 'https://github.com.example.com' . $good ),
			'other host'      => array( 'https://objects.githubusercontent.com' . $good ),
			'credentials'     => array( 'https://user@github.com' . $good ),
			'explicit port'   => array( 'https://github.com:443' . $good ),
			'query'           => array( 'https://github.com' . $good . '?token=x' ),
			'fragment'        => array( 'https://github.com' . $good . '#x' ),
			'traversal'       => array( 'https://github.com/TheAggressive/Aggressive-Blocks/releases/download/v2.4.0/../aggressive-blocks-2.4.0.zip' ),
			'other repo'      => array( 'https://github.com/TheAggressive/Aggressive-Ads/releases/download/v2.4.0/aggressive-blocks-2.4.0.zip' ),
			'version skew'    => array( 'https://github.com/TheAggressive/Aggressive-Blocks/releases/download/v2.4.0/aggressive-blocks-2.5.0.zip' ),
			'checksum asset'  => array( 'https://github.com' . $good . '.sha256' ),
			'prerelease tag'  => array( 'https://github.com/TheAggressive/Aggressive-Blocks/releases/download/v2.4.0-rc.1/aggressive-blocks-2.4.0-rc.1.zip' ),
		);
	}

	/**
	 * A package whose bytes match its checksum is handed to WordPress.
	 *
	 * @return void
	 */
	public function test_installs_a_package_that_matches_its_checksum(): void {
		$zip = 'verified package bytes';
		$this->mock_github( array( $this->release( '2.4.0' ) ), hash( 'sha256', $zip ), $zip );

		$result = $this->packages->verify_download( false, self::BASE . '/v2.4.0/aggressive-blocks-2.4.0.zip' );

		$this->assertIsString( $result );
		$this->assertSame( $zip, file_get_contents( $result ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Reading a local temp file.
		wp_delete_file( $result );
	}

	/**
	 * A package whose bytes differ is refused, and the download is removed.
	 *
	 * @return void
	 */
	public function test_refuses_a_package_that_fails_its_checksum(): void {
		$this->mock_github( array( $this->release( '2.4.0' ) ), hash( 'sha256', 'the real package' ), 'tampered bytes' );
		$before = (array) glob( get_temp_dir() . 'aggressive-blocks-2.4.0*' );

		$result = $this->packages->verify_download( false, self::BASE . '/v2.4.0/aggressive-blocks-2.4.0.zip' );

		$this->assertWPError( $result );
		$this->assertSame( 'aggressive_blocks_update_checksum_mismatch', $result->get_error_code() );
		$this->assertSame( $before, (array) glob( get_temp_dir() . 'aggressive-blocks-2.4.0*' ), 'The rejected download is deleted.' );
	}

	/**
	 * Without a checksum, even our package is refused.
	 *
	 * @return void
	 */
	public function test_refuses_our_package_without_a_checksum(): void {
		$release           = $this->release( '2.4.0' );
		$release['assets'] = array_slice( $release['assets'], 0, 1 );
		$this->mock_github( array( $release ) );

		$result = $this->packages->verify_download( false, self::BASE . '/v2.4.0/aggressive-blocks-2.4.0.zip' );

		$this->assertWPError( $result );
		$this->assertSame( 'aggressive_blocks_update_checksum_missing', $result->get_error_code() );
	}

	/**
	 * Any other package, and an earlier error, pass through untouched.
	 *
	 * @return void
	 */
	public function test_other_downloads_pass_through(): void {
		$this->mock_github( array( $this->release( '2.4.0' ) ) );
		$error = new \WP_Error( 'earlier', 'Earlier failure' );

		$this->assertFalse( $this->packages->verify_download( false, 'https://downloads.wordpress.org/plugin/akismet.zip' ) );
		$this->assertSame( '/tmp/x.zip', $this->packages->verify_download( '/tmp/x.zip', 'https://downloads.wordpress.org/plugin/akismet.zip' ) );
		$this->assertSame( $error, $this->packages->verify_download( $error, self::BASE . '/v2.4.0/aggressive-blocks-2.4.0.zip' ) );
		$this->assertSame( array(), $this->requests );
	}

	/**
	 * A file an earlier callback supplied for our package (a download cache)
	 * is verified too, not trusted.
	 *
	 * @return void
	 */
	public function test_verifies_a_package_an_earlier_callback_supplied(): void {
		$this->mock_github( array( $this->release( '2.4.0' ) ), hash( 'sha256', 'the real package' ) );
		$package = self::BASE . '/v2.4.0/aggressive-blocks-2.4.0.zip';

		$cached = wp_tempnam( 'aggressive-blocks-cache' );
		file_put_contents( $cached, 'the real package' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- Local temp file.
		$this->assertSame( $cached, $this->packages->verify_download( $cached, $package ) );

		file_put_contents( $cached, 'a poisoned cache' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- Local temp file.
		$result = $this->packages->verify_download( $cached, $package );
		$this->assertWPError( $result );
		$this->assertSame( 'aggressive_blocks_update_checksum_mismatch', $result->get_error_code() );
		$this->assertFileDoesNotExist( $cached );
	}

	/**
	 * "View details" shows the release, with its notes as escaped text.
	 *
	 * @return void
	 */
	public function test_plugin_information_escapes_release_notes(): void {
		$release         = $this->release( '2.4.0' );
		$release['body'] = "Fixes\n<script>alert(1)</script>";
		$this->mock_github( array( $release ) );

		$info = $this->updates->plugin_information( false, 'plugin_information', (object) array( 'slug' => 'aggressive-blocks' ) );

		$this->assertIsObject( $info );
		$this->assertSame( 'Aggressive Blocks', $info->name );
		$this->assertSame( '2.4.0', $info->version );
		$this->assertSame( '8.2', $info->requires_php );
		$this->assertStringNotContainsString( '<script>', $info->sections['changelog'] );
		$this->assertStringContainsString( '&lt;script&gt;', $info->sections['changelog'] );
		$this->assertFalse( $this->updates->plugin_information( false, 'plugin_information', (object) array( 'slug' => 'akismet' ) ) );
	}

	/**
	 * Caches are cleared after this plugin updates, not after another.
	 *
	 * @return void
	 */
	public function test_clears_caches_only_after_its_own_update(): void {
		$this->mock_github( array( $this->release( '2.4.0' ) ) );
		$this->updates->update( false, $this->installed( '2.3.0' ), $this->plugin_file() );

		$this->updates->clear_after_update(
			null,
			array(
				'action'  => 'update',
				'type'    => 'plugin',
				'plugins' => array( 'akismet/akismet.php' ),
			)
		);
		$this->assertNotFalse( get_site_transient( Release_Repository::CACHE_KEY ) );

		$this->updates->clear_after_update(
			null,
			array(
				'action'  => 'update',
				'type'    => 'plugin',
				'plugins' => array( $this->plugin_file() ),
			)
		);
		$this->assertFalse( get_site_transient( Release_Repository::CACHE_KEY ) );
		$this->assertFalse( get_site_transient( Package_Verifier::CACHE_KEY ) );
	}

	/**
	 * This plugin's basename.
	 *
	 * @return string
	 */
	private function plugin_file(): string {
		return plugin_basename( AGGRESSIVE_BLOCKS_FILE );
	}

	/**
	 * Installed plugin headers, as WordPress passes them.
	 *
	 * @param string $version Installed version.
	 * @return array<string, string>
	 */
	private function installed( string $version ): array {
		return array(
			'Version'   => $version,
			'UpdateURI' => Plugin_Updates::UPDATE_URI,
		);
	}

	/**
	 * GitHub release metadata in the shape the API returns.
	 *
	 * @param string $version Version.
	 * @return array<string, mixed>
	 */
	private function release( string $version ): array {
		$zip = "aggressive-blocks-{$version}.zip";

		return array(
			'tag_name'     => "v{$version}",
			'draft'        => false,
			'prerelease'   => false,
			'published_at' => '2026-09-28T12:00:00Z',
			'body'         => 'Release notes.',
			'assets'       => array(
				array(
					'name'                 => $zip,
					'browser_download_url' => self::BASE . "/v{$version}/{$zip}",
				),
				array(
					'name'                 => "{$zip}.sha256",
					'browser_download_url' => self::BASE . "/v{$version}/{$zip}.sha256",
				),
			),
		);
	}

	/**
	 * Mock GitHub; any request outside it fails.
	 *
	 * @param array<int, array<string, mixed>> $releases Release list.
	 * @param string                           $checksum Checksum sidecar digest.
	 * @param string                           $zip      Package bytes.
	 * @return void
	 */
	private function mock_github( array $releases, string $checksum = '', string $zip = 'package' ): void {
		$checksum = '' === $checksum ? hash( 'sha256', $zip ) : $checksum;

		$this->mock_http(
			function ( string $url, array $args ) use ( $releases, $checksum, $zip ) {
				$this->requests[] = $url;

				if ( str_starts_with( $url, 'https://api.github.com/repos/TheAggressive/Aggressive-Blocks/releases' ) ) {
					return self::response( (string) wp_json_encode( $releases ) );
				}
				if ( 1 === preg_match( '#^https://raw\.githubusercontent\.com/TheAggressive/Aggressive-Blocks/v[\d.]+/readme\.txt$#', $url ) ) {
					return self::response( "=== Aggressive Blocks ===\nRequires at least: 7.0\nTested up to: 7.1\nRequires PHP: 8.2\nStable tag: 2.4.0\n" );
				}
				if ( str_ends_with( $url, '.zip.sha256' ) ) {
					return self::response( $checksum . '  aggressive-blocks.zip' );
				}
				if ( str_ends_with( $url, '.zip' ) && ! empty( $args['filename'] ) ) {
					file_put_contents( $args['filename'], $zip ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- Simulates the streamed download into WordPress's temp file.
					return self::response( '' );
				}

				return new \WP_Error( 'unexpected_request', $url );
			}
		);
	}

	/**
	 * Route every WordPress HTTP request to a callback.
	 *
	 * @param callable $handler Receives the URL and request arguments.
	 * @return void
	 */
	private function mock_http( callable $handler ): void {
		add_filter(
			'pre_http_request',
			static fn( $preempt, array $args, string $url ) => $handler( $url, $args ),
			10,
			3
		);
	}

	/**
	 * A successful WordPress HTTP response.
	 *
	 * @param string $body Body.
	 * @return array<string, mixed>
	 */
	private static function response( string $body ): array {
		return array(
			'headers'  => array(),
			'body'     => $body,
			'response' => array(
				'code'    => 200,
				'message' => 'OK',
			),
			'cookies'  => array(),
			'filename' => null,
		);
	}
}
