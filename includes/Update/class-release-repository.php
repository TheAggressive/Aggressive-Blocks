<?php
/**
 * GitHub release metadata for plugin updates.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Update;

/**
 * Finds the newest stable release of this plugin on GitHub, and the exact,
 * trusted URLs of its package, checksum, and readme.
 *
 * Release metadata is cached network-wide. A failed lookup is cached too, for
 * the same short window, so a GitHub outage or rate limit costs one request
 * per window instead of one per update check. On failure the last good
 * release is still returned.
 */
final class Release_Repository {

	/** Network-wide release cache. */
	public const CACHE_KEY = 'aggressive_blocks_update_release';

	/** How long a lookup, successful or not, is trusted. */
	private const FRESH_SECONDS = 5 * MINUTE_IN_SECONDS;

	/** How long the last good release is kept as a fallback. */
	private const KEEP_SECONDS = DAY_IN_SECONDS;

	/** GitHub owner. */
	public const OWNER = 'TheAggressive';

	/** GitHub repository. */
	public const REPOSITORY = 'Aggressive-Blocks';

	/** File name prefix of every release asset. */
	private const ASSET_PREFIX = 'aggressive-blocks-';

	/**
	 * HTTP client.
	 *
	 * @var Update_Http_Client
	 */
	private Update_Http_Client $http;

	/**
	 * Constructor.
	 *
	 * @param Update_Http_Client $http HTTP client.
	 */
	public function __construct( Update_Http_Client $http ) {
		$this->http = $http;
	}

	/**
	 * Repository homepage.
	 *
	 * @return string
	 */
	public function repository_url(): string {
		return 'https://github.com/' . self::OWNER . '/' . self::REPOSITORY;
	}

	/**
	 * The newest stable release, or false when none is known.
	 *
	 * @return array<string, mixed>|false
	 */
	public function latest(): array|false {
		$cached  = get_site_transient( self::CACHE_KEY );
		$release = is_array( $cached ) && isset( $cached['release'] ) && is_array( $cached['release'] )
			? $cached['release']
			: null;

		if ( is_array( $cached ) && isset( $cached['checked_at'] ) && ( time() - (int) $cached['checked_at'] ) < self::FRESH_SECONDS ) {
			return $release ?? false;
		}

		$response = $this->http->get(
			'https://api.github.com/repos/' . self::OWNER . '/' . self::REPOSITORY . '/releases?per_page=20',
			MB_IN_BYTES,
			array(
				'Accept'               => 'application/vnd.github+json',
				'X-GitHub-Api-Version' => '2022-11-28',
			)
		);

		$decoded = null;
		if ( ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ) {
			$decoded = json_decode( wp_remote_retrieve_body( $response ), true );
		}

		$fresh = is_array( $decoded ) ? $this->select_stable( $decoded ) : null;

		set_site_transient(
			self::CACHE_KEY,
			array(
				'release'    => $fresh ?? $release,
				'checked_at' => time(),
			),
			self::KEEP_SECONDS
		);

		return $fresh ?? $release ?? false;
	}

	/**
	 * A release's version, from a strict vX.Y.Z tag.
	 *
	 * @param array<string, mixed> $release GitHub release.
	 * @return string|null
	 */
	public function version( array $release ): ?string {
		$tag = $release['tag_name'] ?? null;
		if ( ! is_string( $tag ) || 1 !== preg_match( '/^v(\d+\.\d+\.\d+)$/', $tag, $matches ) ) {
			return null;
		}

		return $matches[1];
	}

	/**
	 * The release's ZIP URL, if it is the exact trusted asset.
	 *
	 * @param array<string, mixed> $release GitHub release.
	 * @return string|false
	 */
	public function package_url( array $release ): string|false {
		$version = $this->version( $release );

		return null === $version ? false : $this->asset_url( $release, self::ASSET_PREFIX . $version . '.zip' );
	}

	/**
	 * The release's SHA-256 sidecar URL, if it is the exact trusted asset.
	 *
	 * @param array<string, mixed> $release GitHub release.
	 * @return string|false
	 */
	public function checksum_url( array $release ): string|false {
		$version = $this->version( $release );

		return null === $version ? false : $this->asset_url( $release, self::ASSET_PREFIX . $version . '.zip.sha256' );
	}

	/**
	 * Whether a URL is this repository's package asset for its own tag.
	 *
	 * @param string $url Candidate URL.
	 * @return bool
	 */
	public function is_allowed_package_url( string $url ): bool {
		return $this->is_allowed_release_url( $url, '.zip' );
	}

	/**
	 * What the release's readme declares: the WordPress and PHP it requires
	 * and the WordPress it was tested with. Empty when unknown.
	 *
	 * The package's own header is what WordPress enforces when it installs,
	 * and it matches this readme (the CI contracts require it). Knowing it in
	 * advance lets WordPress mark an incompatible update as such, and keeps
	 * auto-updates from attempting it.
	 *
	 * @param array<string, mixed> $release GitHub release.
	 * @return array{requires?: string, tested?: string, requires_php?: string}
	 */
	public function requirements( array $release ): array {
		$version = $this->version( $release );
		if ( null === $version ) {
			return array();
		}

		$cache_key = self::CACHE_KEY . '_requirements';
		$cached    = get_site_transient( $cache_key );
		if ( is_array( $cached ) && ( $cached['version'] ?? null ) === $version && is_array( $cached['requirements'] ?? null ) ) {
			return $cached['requirements'];
		}

		$response = $this->http->get(
			'https://raw.githubusercontent.com/' . self::OWNER . '/' . self::REPOSITORY . '/v' . $version . '/readme.txt',
			64 * KB_IN_BYTES
		);

		$requirements = array();
		if ( ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ) {
			$fields = array(
				'requires'     => 'Requires at least',
				'tested'       => 'Tested up to',
				'requires_php' => 'Requires PHP',
			);
			foreach ( $fields as $key => $label ) {
				if ( 1 === preg_match( '/^' . preg_quote( $label, '/' ) . ':[ \t]*(\d+(?:\.\d+){0,2})[ \t]*$/mi', wp_remote_retrieve_body( $response ), $matches ) ) {
					$requirements[ $key ] = $matches[1];
				}
			}
		}

		// Cached even when empty, so a missing readme is not refetched on
		// every check.
		set_site_transient(
			$cache_key,
			array(
				'version'      => $version,
				'requirements' => $requirements,
			),
			array() === $requirements ? self::FRESH_SECONDS : self::KEEP_SECONDS
		);

		return $requirements;
	}

	/**
	 * Forget every cached lookup.
	 *
	 * @return void
	 */
	public function flush(): void {
		delete_site_transient( self::CACHE_KEY );
		delete_site_transient( self::CACHE_KEY . '_requirements' );
	}

	/**
	 * The highest strict-semver release that is neither a draft nor a
	 * prerelease.
	 *
	 * @param array<mixed> $releases GitHub releases.
	 * @return array<string, mixed>|null
	 */
	private function select_stable( array $releases ): ?array {
		$best         = null;
		$best_version = null;

		foreach ( $releases as $release ) {
			if ( ! is_array( $release ) || ! empty( $release['draft'] ) || ! empty( $release['prerelease'] ) ) {
				continue;
			}

			$version = $this->version( $release );
			if ( null !== $version && ( null === $best_version || version_compare( $version, $best_version, '>' ) ) ) {
				$best         = $release;
				$best_version = $version;
			}
		}

		return $best;
	}

	/**
	 * Find an asset by exact name, and return its URL only if it is trusted.
	 *
	 * @param array<string, mixed> $release GitHub release.
	 * @param string               $name    Expected file name.
	 * @return string|false
	 */
	private function asset_url( array $release, string $name ): string|false {
		$assets = $release['assets'] ?? null;
		if ( ! is_array( $assets ) ) {
			return false;
		}

		foreach ( $assets as $asset ) {
			if ( ! is_array( $asset ) || ( $asset['name'] ?? null ) !== $name ) {
				continue;
			}

			$url    = $asset['browser_download_url'] ?? null;
			$suffix = str_ends_with( $name, '.sha256' ) ? '.zip.sha256' : '.zip';

			return is_string( $url ) && $this->is_allowed_release_url( $url, $suffix ) ? $url : false;
		}

		return false;
	}

	/**
	 * Validate the origin, repository, tag, and file name of a release asset.
	 *
	 * Only https://github.com/{owner}/{repository}/releases/download/vX.Y.Z/
	 * aggressive-blocks-X.Y.Z{suffix} qualifies, with no credentials, port,
	 * query, fragment, or dot segments, and the file named for its own tag.
	 *
	 * @param string $url    Candidate URL.
	 * @param string $suffix Required file suffix.
	 * @return bool
	 */
	private function is_allowed_release_url( string $url, string $suffix ): bool {
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) ) {
			return false;
		}

		if (
			'https' !== strtolower( (string) ( $parts['scheme'] ?? '' ) )
			|| 'github.com' !== strtolower( (string) ( $parts['host'] ?? '' ) )
			|| isset( $parts['port'] )
			|| isset( $parts['user'] )
			|| isset( $parts['pass'] )
			|| isset( $parts['query'] )
			|| isset( $parts['fragment'] )
		) {
			return false;
		}

		$path = rawurldecode( (string) ( $parts['path'] ?? '' ) );
		if ( array_intersect( array( '.', '..' ), explode( '/', $path ) ) ) {
			return false;
		}

		$pattern = '#^/' . preg_quote( self::OWNER, '#' ) . '/' . preg_quote( self::REPOSITORY, '#' ) . '/releases/download/v(\d+\.\d+\.\d+)/([^/]+)$#';
		if ( 1 !== preg_match( $pattern, $path, $matches ) ) {
			return false;
		}

		return hash_equals( self::ASSET_PREFIX . $matches[1] . $suffix, $matches[2] );
	}
}
