<?php
/**
 * Block rename migrator tests.
 *
 * The fixtures under tests/fixtures/migration are the saved-content contract
 * for 1.x → 2.0. See docs/migration.md.
 *
 * @package Aggressive_Blocks\Tests\Unit\Migration
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Migration;

use Aggressive_Blocks\Migration\Block_Renamer;
use WP_Block_Type_Registry;
use WP_UnitTestCase;

/**
 * Fixture-driven rename coverage.
 */
class Block_Renamer_Test extends WP_UnitTestCase {

	private const FIXTURES = __DIR__ . '/../../fixtures/migration';

	/**
	 * Every legacy fixture, keyed by file name.
	 *
	 * @return array<string, array{0: string}>
	 */
	public function fixture_provider(): array {
		$cases = array();
		foreach ( (array) glob( self::FIXTURES . '/legacy/*.html' ) as $path ) {
			$name           = basename( (string) $path );
			$cases[ $name ] = array( $name );
		}
		return $cases;
	}

	/**
	 * The fixtures cover every block family that had a legacy name.
	 *
	 * @return void
	 */
	public function test_fixtures_cover_every_moved_block(): void {
		$seen = array();
		foreach ( $this->fixture_provider() as $case ) {
			foreach ( $this->names( parse_blocks( $this->legacy( $case[0] ) ) ) as $name ) {
				$seen[ $name ] = true;
			}
		}

		foreach ( Block_Renamer::SLUGS as $slug ) {
			$this->assertArrayHasKey( 'aggressive-apparel/' . $slug, $seen, "No 1.x fixture uses {$slug}." );
		}
	}

	/**
	 * The rewrite is exactly the reviewed golden file.
	 *
	 * @dataProvider fixture_provider
	 *
	 * @param string $name Fixture file name.
	 * @return void
	 */
	public function test_rewrite_matches_golden_output( string $name ): void {
		$result = Block_Renamer::rewrite( $this->legacy( $name ) );

		$this->assertTrue( $result['changed'] );
		$this->assertSame( $this->migrated( $name ), $result['content'] );
		$this->assertSame( $this->count_moved( parse_blocks( $this->legacy( $name ) ) ), $result['count'] );
	}

	/**
	 * Parsed before and after, only names and the generated class differ.
	 *
	 * @dataProvider fixture_provider
	 *
	 * @param string $name Fixture file name.
	 * @return void
	 */
	public function test_preserves_structure_attributes_and_html( string $name ): void {
		$before = parse_blocks( $this->legacy( $name ) );
		$after  = parse_blocks( Block_Renamer::rewrite( $this->legacy( $name ) )['content'] );

		$this->assertNotEmpty( $this->moved_names( $before ), 'Legacy fixture must parse with moved blocks.' );
		$this->assert_equivalent_trees( $before, $after, $name );
	}

	/**
	 * Migrated content is current block structure and never migrates again.
	 *
	 * @dataProvider fixture_provider
	 *
	 * @param string $name Fixture file name.
	 * @return void
	 */
	public function test_migrated_content_is_current_and_idempotent( string $name ): void {
		$migrated = $this->migrated( $name );
		$again    = Block_Renamer::rewrite( $migrated );

		$this->assertFalse( $again['changed'] );
		$this->assertSame( 0, $again['count'] );
		$this->assertSame( $migrated, $again['content'] );

		$registry = WP_Block_Type_Registry::get_instance();
		$parsed   = parse_blocks( $migrated );
		$this->assertSame( array(), $this->moved_names( $parsed ) );

		foreach ( $this->names( $parsed ) as $block_name ) {
			if ( str_starts_with( $block_name, 'aggressive-blocks/' ) ) {
				$this->assertTrue( $registry->is_registered( $block_name ), "{$block_name} is not registered." );
			}
		}
	}

	/**
	 * Legacy-looking text, other owners' blocks, and JSON bytes stay as saved.
	 *
	 * @return void
	 */
	public function test_leaves_lookalikes_and_other_blocks_byte_for_byte(): void {
		$migrated = Block_Renamer::rewrite( $this->legacy( 'edge-cases.html' ) )['content'];

		$untouched = array(
			'classic text'       => 'mentions wp:aggressive-apparel/hero-carousel outside any block',
			'escaped paragraph'  => 'it rewrites &lt;!-- wp:aggressive-apparel/modal --&gt; comments',
			'code block'         => '<code>&lt;!-- wp:aggressive-apparel/ticker {"speed":2} /--&gt;</code>',
			'attribute value'    => '"name":"Before \u003c!\u002d\u002d wp:aggressive-apparel/parallax \u002d\u002d\u003e"',
			'class name'         => 'class="legacy-aggressive-apparel/parallax"',
			'html comment'       => '<!-- note: aggressive-apparel/card-flip moved to the plugin -->',
			'data attribute'     => 'data-block="wp:aggressive-apparel/modal"',
			'core namespace'     => '<!-- wp:core/paragraph {"metadata"',
			'theme block'        => '<!-- wp:aggressive-apparel/product-rating {"textAlign":"center"} /-->',
			'third-party block'  => '<!-- wp:woocommerce/product-price {"isDescendentOfSingleProductTemplate":true} /-->',
			'current block'      => '<!-- wp:aggressive-blocks/ticker {"showLabel":true,"labelText":"NEW"} -->',
			'escaped slashes'    => '"name":"FW26 \/ https:\/\/cdn.example.com\/drops"',
			'empty object'       => '"bindings":{}',
			'unicode escapes'    => '"ownerName":"Ren\u00e9e \u0026 Co"',
			'entities in html'   => '<h3 class="wp-block-heading">Ren&eacute;e &amp; the crew</h3>',
		);
		foreach ( $untouched as $label => $needle ) {
			$this->assertStringContainsString( $needle, $migrated, "Changed the {$label}." );
		}
	}

	/**
	 * Malformed attribute JSON on another block survives verbatim.
	 *
	 * @return void
	 */
	public function test_keeps_unparseable_attributes_of_other_blocks(): void {
		// Real 1.x pattern markup: an unbalanced JSON object that
		// parse_blocks() reads as no attributes at all.
		$paragraph = '<!-- wp:paragraph {"style":{"spacing":{"margin":{"top":"var:preset|spacing|4"}},"textColor":"foreground-muted","fontSize":"small"} -->';

		$this->assertStringContainsString( $paragraph, $this->legacy( 'pattern-fabric-reveal-trio.html' ) );
		$this->assertStringContainsString(
			$paragraph,
			Block_Renamer::rewrite( $this->legacy( 'pattern-fabric-reveal-trio.html' ) )['content']
		);
	}

	/**
	 * Only the block's own generated class on its root element is renamed.
	 *
	 * @return void
	 */
	public function test_renames_only_the_generated_wrapper_class(): void {
		$content = '<!-- wp:aggressive-apparel/card-flip-front -->'
			. '<div class="wp-block-aggressive-apparel-card-flip-front aa-card-flip__face">'
			. '<!-- wp:paragraph --><p class="wp-block-aggressive-apparel-card-flip-front">Inner</p><!-- /wp:paragraph -->'
			. '</div>'
			. '<!-- /wp:aggressive-apparel/card-flip-front -->'
			. '<!-- wp:aggressive-apparel/modal -->'
			. '<div class="wp-block-aggressive-apparel-modal-extra wp-block-aggressive-apparel-modal__close"></div>'
			. '<!-- /wp:aggressive-apparel/modal -->';

		$this->assertSame(
			'<!-- wp:aggressive-blocks/card-flip-front -->'
			. '<div class="wp-block-aggressive-blocks-card-flip-front aa-card-flip__face">'
			. '<!-- wp:paragraph --><p class="wp-block-aggressive-apparel-card-flip-front">Inner</p><!-- /wp:paragraph -->'
			. '</div>'
			. '<!-- /wp:aggressive-blocks/card-flip-front -->'
			. '<!-- wp:aggressive-blocks/modal -->'
			. '<div class="wp-block-aggressive-apparel-modal-extra wp-block-aggressive-apparel-modal__close"></div>'
			. '<!-- /wp:aggressive-blocks/modal -->',
			Block_Renamer::rewrite( $content )['content']
		);
	}

	/**
	 * Unrelated blocks are left alone.
	 *
	 * @return void
	 */
	public function test_leaves_unmapped_blocks_alone(): void {
		$content = '<!-- wp:aggressive-apparel/wishlist --><!-- /wp:aggressive-apparel/wishlist -->';
		$result  = Block_Renamer::rewrite( $content );
		$this->assertFalse( $result['changed'] );
		$this->assertSame( $content, $result['content'] );
	}

	/**
	 * Assert two parsed trees differ only by the rename.
	 *
	 * @param array<int, array<string, mixed>> $before Legacy tree.
	 * @param array<int, array<string, mixed>> $after  Migrated tree.
	 * @param string                           $path   Location for messages.
	 * @return void
	 */
	private function assert_equivalent_trees( array $before, array $after, string $path ): void {
		$this->assertCount( count( $before ), $after, "Block count changed at {$path}." );

		foreach ( $before as $index => $block ) {
			$next  = $after[ $index ];
			$name  = (string) $block['blockName'];
			$here  = "{$path} > {$name}#{$index}";
			$moved = in_array( $name, $this->moved_legacy_names(), true );

			$this->assertSame(
				$moved ? str_replace( 'aggressive-apparel/', 'aggressive-blocks/', $name ) : $block['blockName'],
				$next['blockName'],
				"Name at {$here}."
			);
			$this->assertSame( $block['attrs'], $next['attrs'], "Attributes at {$here}." );

			$class_rename = static function ( $html ) use ( $moved, $name ) {
				if ( ! $moved || ! is_string( $html ) ) {
					return $html;
				}
				$slug = substr( $name, strlen( 'aggressive-apparel/' ) );
				return (string) preg_replace(
					'/(?<=["\s])wp-block-aggressive-apparel-' . preg_quote( $slug, '/' ) . '(?=["\s])/',
					'wp-block-aggressive-blocks-' . $slug,
					$html,
					1
				);
			};
			$this->assertSame( $class_rename( $block['innerHTML'] ), $next['innerHTML'], "HTML at {$here}." );
			$this->assertSame(
				array_map( $class_rename, array_slice( $block['innerContent'], 0, 1 ) ) + $block['innerContent'],
				$next['innerContent'],
				"innerContent at {$here}."
			);

			$this->assert_equivalent_trees( $block['innerBlocks'], $next['innerBlocks'], $here );
		}
	}

	/**
	 * Legacy names this plugin took over.
	 *
	 * @return array<int, string>
	 */
	private function moved_legacy_names(): array {
		return array_map(
			static fn( string $slug ): string => 'aggressive-apparel/' . $slug,
			Block_Renamer::SLUGS
		);
	}

	/**
	 * Legacy names of moved blocks in a tree.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return array<int, string>
	 */
	private function moved_names( array $blocks ): array {
		return array_values( array_intersect( $this->names( $blocks ), $this->moved_legacy_names() ) );
	}

	/**
	 * Count moved blocks in a tree.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return int
	 */
	private function count_moved( array $blocks ): int {
		return count( $this->moved_names( $blocks ) );
	}

	/**
	 * Every block name in a tree, depth first.
	 *
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @return array<int, string>
	 */
	private function names( array $blocks ): array {
		$names = array();
		foreach ( $blocks as $block ) {
			if ( is_string( $block['blockName'] ) ) {
				$names[] = $block['blockName'];
			}
			$names = array_merge( $names, $this->names( $block['innerBlocks'] ) );
		}
		return $names;
	}

	/**
	 * Read a legacy fixture.
	 *
	 * @param string $name File name.
	 * @return string
	 */
	private function legacy( string $name ): string {
		return (string) file_get_contents( self::FIXTURES . '/legacy/' . $name );
	}

	/**
	 * Read a golden migrated fixture.
	 *
	 * @param string $name File name.
	 * @return string
	 */
	private function migrated( string $name ): string {
		return (string) file_get_contents( self::FIXTURES . '/migrated/' . $name );
	}
}
