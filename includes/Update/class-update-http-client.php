<?php
/**
 * Bounded HTTP access for the plugin updater.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Update;

/**
 * The only outbound HTTP in the plugin: GETs to the updater's fixed GitHub
 * endpoints, through wp_safe_remote_get() with a short timeout and a response
 * size cap.
 */
final class Update_Http_Client {

	/**
	 * Fetch an updater resource.
	 *
	 * @param string                $url       Trusted HTTPS URL built by the updater.
	 * @param int                   $max_bytes Largest response body to accept.
	 * @param array<string, string> $headers   Extra request headers.
	 * @return array<string, mixed>|\WP_Error
	 */
	public function get( string $url, int $max_bytes, array $headers = array() ): array|\WP_Error {
		return wp_safe_remote_get(
			$url,
			array(
				'timeout'             => 3,
				'redirection'         => 3,
				'limit_response_size' => $max_bytes,
				'headers'             => array_merge(
					array( 'User-Agent' => 'Aggressive-Blocks-Updater/' . AGGRESSIVE_BLOCKS_VERSION ),
					$headers
				),
			)
		);
	}
}
