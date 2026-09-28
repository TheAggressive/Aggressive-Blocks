<?php
/**
 * Integrity verification for update packages.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Update;

/**
 * Resolves a release's SHA-256 checksum and verifies the downloaded ZIP
 * against it before WordPress unpacks anything.
 */
final class Package_Verifier {

	/** Network-wide cache of the last verified package and its checksum. */
	public const CACHE_KEY = 'aggressive_blocks_update_package';

	/**
	 * Release repository.
	 *
	 * @var Release_Repository
	 */
	private Release_Repository $releases;

	/**
	 * HTTP client.
	 *
	 * @var Update_Http_Client
	 */
	private Update_Http_Client $http;

	/**
	 * Constructor.
	 *
	 * @param Release_Repository $releases Release repository.
	 * @param Update_Http_Client $http     HTTP client.
	 */
	public function __construct( Release_Repository $releases, Update_Http_Client $http ) {
		$this->releases = $releases;
		$this->http     = $http;
	}

	/**
	 * The SHA-256 checksum of a package, from cache or from its release.
	 *
	 * @param string                    $package Package URL.
	 * @param array<string, mixed>|null $release Release the package belongs to.
	 * @return string|false Lowercase hex digest, or false when unknown.
	 */
	public function checksum( string $package, ?array $release = null ): string|false {
		$cached = get_site_transient( self::CACHE_KEY );
		if (
			is_array( $cached )
			&& is_string( $cached['package'] ?? null )
			&& is_string( $cached['checksum'] ?? null )
			&& hash_equals( $cached['package'], $package )
			&& self::is_digest( $cached['checksum'] )
		) {
			return strtolower( $cached['checksum'] );
		}

		$release = $release ?? $this->releases->latest();
		if ( ! is_array( $release ) || $package !== $this->releases->package_url( $release ) ) {
			return false;
		}

		$checksum_url = $this->releases->checksum_url( $release );
		if ( false === $checksum_url ) {
			return false;
		}

		$response = $this->http->get( $checksum_url, KB_IN_BYTES );
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return false;
		}

		// sha256sum output: the digest, optionally followed by the file name.
		if ( 1 !== preg_match( '/^\s*([a-f0-9]{64})(?:\s+\*?[^\r\n]+)?\s*$/i', wp_remote_retrieve_body( $response ), $matches ) ) {
			return false;
		}

		$checksum = strtolower( $matches[1] );
		set_site_transient(
			self::CACHE_KEY,
			array(
				'package'  => $package,
				'checksum' => $checksum,
			),
			DAY_IN_SECONDS
		);

		return $checksum;
	}

	/**
	 * Verify our package before WordPress unpacks it.
	 *
	 * Runs last on upgrader_pre_download. Any other package passes through
	 * untouched. For ours, whatever file is about to be installed is hashed:
	 * one an earlier callback supplied (a download cache, WP-CLI's included),
	 * or one downloaded here. A missing checksum or a mismatch is an error, so
	 * the installed plugin is never replaced with unverified code.
	 *
	 * @param false|\WP_Error|string $reply   Result of earlier callbacks.
	 * @param mixed                  $package Package URL.
	 * @return false|\WP_Error|string Local path of the verified ZIP, or an error.
	 */
	public function verify_download( $reply, $package ) {
		if ( is_wp_error( $reply ) || ! is_string( $package ) || ! $this->releases->is_allowed_package_url( $package ) ) {
			return $reply;
		}

		$checksum = $this->checksum( $package );
		if ( false === $checksum ) {
			return new \WP_Error(
				'aggressive_blocks_update_checksum_missing',
				__( 'The Aggressive Blocks update has no valid SHA-256 checksum, so it was not installed.', 'aggressive-blocks' )
			);
		}

		if ( is_string( $reply ) ) {
			$downloaded = $reply;
		} else {
			if ( ! function_exists( 'download_url' ) ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
			}

			$downloaded = download_url( $package, 60 );
			if ( is_wp_error( $downloaded ) ) {
				return $downloaded;
			}
		}

		$actual = is_file( $downloaded ) ? hash_file( 'sha256', $downloaded ) : false;
		if ( ! is_string( $actual ) || ! hash_equals( $checksum, strtolower( $actual ) ) ) {
			wp_delete_file( $downloaded );

			return new \WP_Error(
				'aggressive_blocks_update_checksum_mismatch',
				__( 'The Aggressive Blocks update failed its SHA-256 integrity check, so it was not installed.', 'aggressive-blocks' )
			);
		}

		return $downloaded;
	}

	/**
	 * Forget the cached checksum.
	 *
	 * @return void
	 */
	public function flush(): void {
		delete_site_transient( self::CACHE_KEY );
	}

	/**
	 * Whether a string is a hex SHA-256 digest.
	 *
	 * @param string $checksum Candidate.
	 * @return bool
	 */
	private static function is_digest( string $checksum ): bool {
		return 1 === preg_match( '/^[a-f0-9]{64}$/i', $checksum );
	}
}
