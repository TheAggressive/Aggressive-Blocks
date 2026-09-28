<?php
/**
 * `wp aggressive-blocks migrate-blocks` against stored content.
 *
 * @package Aggressive_Blocks\Tests\Integration
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Integration;

use Aggressive_Blocks\Migration\Block_Renamer;
use Aggressive_Blocks\Migration\Cli;
use WP_CLI;
use WP_UnitTestCase;

require_once dirname( __DIR__ ) . '/stubs/class-wp-cli.php';

/**
 * The command stores exactly what Block_Renamer returns.
 */
class Migration_Cli_Test extends WP_UnitTestCase {

	private const FIXTURES = __DIR__ . '/../fixtures/migration';

	/**
	 * Run as WP-CLI does: no user, so kses filters are active.
	 *
	 * @return void
	 */
	public function set_up(): void {
		parent::set_up();
		WP_CLI::$output = array();
		wp_set_current_user( 0 );
		kses_init();
	}

	/**
	 * Saved posts and block widgets end up byte-identical to the rewrite.
	 *
	 * @return void
	 */
	public function test_stores_the_rewrite_byte_for_byte(): void {
		$legacy  = $this->fixture( 'legacy/edge-cases.html' );
		$embed   = "<!-- wp:html -->\n<iframe src=\"https://www.youtube.com/embed/fw26\" title=\"Drop film\"></iframe>\n<!-- /wp:html -->\n\n";
		$post_id = $this->insert_unfiltered( $embed . $legacy );
		update_option(
			'widget_block',
			array(
				2              => array( 'content' => $this->fixture( 'legacy/part-footer.html' ) ),
				'_multiwidget' => 1,
			)
		);

		Cli::migrate( array(), array() );

		$this->assertSame( $embed . $this->fixture( 'migrated/edge-cases.html' ), get_post( $post_id )->post_content );
		$widgets = get_option( 'widget_block' );
		$this->assertSame( $this->fixture( 'migrated/part-footer.html' ), $widgets[2]['content'] );
		$this->assertContains( 'Success: Changed 1 post(s), 1 widget instance(s), 3 block(s).', WP_CLI::$output );
	}

	/**
	 * A dry run reports and writes nothing; a second run finds nothing.
	 *
	 * @return void
	 */
	public function test_dry_run_writes_nothing_and_reruns_are_no_ops(): void {
		$legacy  = $this->fixture( 'legacy/pattern-fabric-reveal-trio.html' );
		$post_id = $this->insert_unfiltered( $legacy );

		Cli::migrate( array(), array( 'dry-run' => true ) );
		$this->assertSame( $legacy, get_post( $post_id )->post_content );
		$this->assertContains( 'Success: Would change 1 post(s), 0 widget instance(s), 9 block(s).', WP_CLI::$output );

		Cli::migrate( array(), array() );
		$migrated = get_post( $post_id )->post_content;
		$this->assertSame( Block_Renamer::rewrite( $legacy )['content'], $migrated );

		WP_CLI::$output = array();
		Cli::migrate( array(), array() );
		$this->assertSame( $migrated, get_post( $post_id )->post_content );
		$this->assertContains( 'Success: Changed 0 post(s), 0 widget instance(s), 0 block(s).', WP_CLI::$output );
	}

	/**
	 * Store content as an editor with unfiltered_html would have saved it.
	 *
	 * @param string $content Post content.
	 * @return int
	 */
	private function insert_unfiltered( string $content ): int {
		kses_remove_filters();
		$post_id = self::factory()->post->create( array( 'post_content' => wp_slash( $content ) ) );
		kses_init();

		$this->assertSame( $content, get_post( $post_id )->post_content );
		return $post_id;
	}

	/**
	 * Read a migration fixture.
	 *
	 * @param string $path Path under tests/fixtures/migration.
	 * @return string
	 */
	private function fixture( string $path ): string {
		return (string) file_get_contents( self::FIXTURES . '/' . $path );
	}
}
