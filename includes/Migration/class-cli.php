<?php
/**
 * WP-CLI content migration.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Migration;

use WP_CLI;
use WP_Query;

/**
 * `wp aggressive-blocks migrate-blocks`.
 */
class Cli {

	/**
	 * Register the command.
	 *
	 * @return void
	 */
	public static function register(): void {
		if ( ! class_exists( '\WP_CLI' ) ) {
			return;
		}

		WP_CLI::add_command( 'aggressive-blocks migrate-blocks', array( self::class, 'migrate' ) );
	}

	/**
	 * Rename stored aggressive-apparel block comments to aggressive-blocks.
	 *
	 * ## OPTIONS
	 *
	 * [--dry-run]
	 * : Report changes without writing.
	 *
	 * ## EXAMPLES
	 *
	 *     wp aggressive-blocks migrate-blocks --dry-run
	 *     wp aggressive-blocks migrate-blocks
	 *
	 * @param array<int, string>   $args       Positional args.
	 * @param array<string, mixed> $assoc_args Flags.
	 * @return void
	 */
	public static function migrate( array $args, array $assoc_args ): void {
		unset( $args );

		$dry_run = isset( $assoc_args['dry-run'] );

		WP_CLI::warning( 'Back up the database before mutating content. This command walks parse_blocks() and is safe to rerun.' );

		$report = array(
			'posts'   => 0,
			'blocks'  => 0,
			'widgets' => 0,
		);

		$post_types = get_post_types( array(), 'names' );
		$query      = new WP_Query(
			array(
				'post_type'              => array_values( $post_types ),
				'post_status'            => 'any',
				'posts_per_page'         => 100,
				'paged'                  => 1,
				's'                      => '',
				'ignore_sticky_posts'    => true,
				'no_found_rows'          => false,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
			)
		);

		global $wpdb;
		// One-shot WP-CLI migration: WP_Query cannot search serialized block
		// comments, so this targeted LIKE is required. Caching would hide
		// posts created during a long run. Not used on front-end requests.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$ids = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT ID FROM {$wpdb->posts} WHERE post_content LIKE %s",
				Block_Renamer::CANDIDATE_LIKE
			)
		);

		foreach ( (array) $ids as $id ) {
			$post = get_post( (int) $id );
			if ( ! $post instanceof \WP_Post ) {
				continue;
			}

			$result = Block_Renamer::rewrite( $post->post_content );
			if ( ! $result['changed'] ) {
				continue;
			}

			++$report['posts'];
			$report['blocks'] += $result['count'];

			WP_CLI::log(
				sprintf(
					'%s post %d (%s) — %d block(s)',
					$dry_run ? 'Would update' : 'Updated',
					$post->ID,
					$post->post_type,
					$result['count']
				)
			);

			if ( ! $dry_run ) {
				wp_update_post(
					array(
						'ID'           => $post->ID,
						'post_content' => $result['content'],
					),
					true
				);
			}
		}

		$widget_block = get_option( 'widget_block' );
		if ( is_array( $widget_block ) ) {
			$changed = false;
			foreach ( $widget_block as $index => $widget ) {
				if ( ! is_array( $widget ) || ! isset( $widget['content'] ) || ! is_string( $widget['content'] ) ) {
					continue;
				}

				$result = Block_Renamer::rewrite( $widget['content'] );
				if ( ! $result['changed'] ) {
					continue;
				}

				$widget_block[ $index ]['content'] = $result['content'];
				++$report['widgets'];
				$report['blocks'] += $result['count'];
				$changed           = true;
			}

			if ( $changed && ! $dry_run ) {
				update_option( 'widget_block', $widget_block );
			}
		}

		unset( $query );

		WP_CLI::success(
			sprintf(
				'%s %d post(s), %d widget instance(s), %d block(s).',
				$dry_run ? 'Would change' : 'Changed',
				$report['posts'],
				$report['widgets'],
				$report['blocks']
			)
		);
	}
}
