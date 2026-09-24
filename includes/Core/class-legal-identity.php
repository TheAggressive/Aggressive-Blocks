<?php
/**
 * Legal identity reader used by the Copyright block.
 *
 * Settings → Terms stays in Aggressive Apparel. This class reads the same
 * option keys so copyright output stays identical when the theme is active
 * and still works on a clean site.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Core;

/**
 * Legal name / privacy / terms accessors.
 */
class Legal_Identity {

	/**
	 * Option key for the legal / organization name.
	 */
	public const LEGAL_NAME_OPTION = 'aggressive_apparel_legal_name';

	/**
	 * Option key for the Terms of Service page ID.
	 */
	public const TERMS_PAGE_OPTION = 'aggressive_apparel_terms_page_id';

	/**
	 * Core option for the Privacy Policy page.
	 */
	public const PRIVACY_PAGE_OPTION = 'wp_page_for_privacy_policy';

	/**
	 * Configured legal / organization name.
	 *
	 * @return string
	 */
	public static function get_legal_name(): string {
		if ( class_exists( '\Aggressive_Apparel\Core\Legal_Identity' ) ) {
			return \Aggressive_Apparel\Core\Legal_Identity::get_legal_name();
		}

		return sanitize_text_field( (string) get_option( self::LEGAL_NAME_OPTION, '' ) );
	}

	/**
	 * Privacy Policy page ID.
	 *
	 * @return int
	 */
	public static function get_privacy_page_id(): int {
		if ( class_exists( '\Aggressive_Apparel\Core\Legal_Identity' ) ) {
			return \Aggressive_Apparel\Core\Legal_Identity::get_privacy_page_id();
		}

		return absint( get_option( self::PRIVACY_PAGE_OPTION, 0 ) );
	}

	/**
	 * Privacy Policy URL, or empty when unset.
	 *
	 * @return string
	 */
	public static function get_privacy_url(): string {
		if ( class_exists( '\Aggressive_Apparel\Core\Legal_Identity' ) ) {
			return \Aggressive_Apparel\Core\Legal_Identity::get_privacy_url();
		}

		return self::get_page_url( self::get_privacy_page_id() );
	}

	/**
	 * Terms of Service page ID.
	 *
	 * @return int
	 */
	public static function get_terms_page_id(): int {
		if ( class_exists( '\Aggressive_Apparel\Core\Legal_Identity' ) ) {
			return \Aggressive_Apparel\Core\Legal_Identity::get_terms_page_id();
		}

		return absint( get_option( self::TERMS_PAGE_OPTION, 0 ) );
	}

	/**
	 * Terms of Service URL, or empty when unset.
	 *
	 * @return string
	 */
	public static function get_terms_url(): string {
		if ( class_exists( '\Aggressive_Apparel\Core\Legal_Identity' ) ) {
			return \Aggressive_Apparel\Core\Legal_Identity::get_terms_url();
		}

		return self::get_page_url( self::get_terms_page_id() );
	}

	/**
	 * Whether a page ID can be used for a legal link.
	 *
	 * @param int $page_id Page ID.
	 * @return bool
	 */
	public static function is_usable_page( int $page_id ): bool {
		if ( $page_id <= 0 ) {
			return false;
		}

		$post = get_post( $page_id );
		return $post instanceof \WP_Post && 'trash' !== $post->post_status;
	}

	/**
	 * Permalink for a legal page, or empty when unset / trashed.
	 *
	 * @param int $page_id Page ID.
	 * @return string
	 */
	public static function get_page_url( int $page_id ): string {
		if ( ! self::is_usable_page( $page_id ) ) {
			return '';
		}

		$url = get_permalink( $page_id );
		return is_string( $url ) ? $url : '';
	}
}
