<?php
/**
 * Block rename migrator tests.
 *
 * @package Aggressive_Blocks\Tests\Unit\Migration
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Migration;

use Aggressive_Blocks\Migration\Block_Renamer;
use WP_UnitTestCase;

/**
 * Parse-and-serialize rename coverage.
 */
class Block_Renamer_Test extends WP_UnitTestCase {

	/**
	 * Nested mapped blocks are renamed once and stay renamed on rerun.
	 *
	 * @return void
	 */
	public function test_rewrites_nested_mapped_blocks_and_is_idempotent(): void {
		$content = '<!-- wp:aggressive-apparel/split-story -->'
			. '<!-- wp:aggressive-apparel/split-story-media -->'
			. '<!-- wp:core/paragraph --><p>Media</p><!-- /wp:core/paragraph -->'
			. '<!-- /wp:aggressive-apparel/split-story-media -->'
			. '<!-- /wp:aggressive-apparel/split-story -->';

		$first = Block_Renamer::rewrite( $content );
		$this->assertTrue( $first['changed'] );
		$this->assertSame( 2, $first['count'] );
		$this->assertStringContainsString( 'wp:aggressive-blocks/split-story', $first['content'] );
		$this->assertStringContainsString( 'wp:aggressive-blocks/split-story-media', $first['content'] );
		$this->assertStringNotContainsString( 'wp:aggressive-apparel/split-story', $first['content'] );

		$second = Block_Renamer::rewrite( $first['content'] );
		$this->assertFalse( $second['changed'] );
		$this->assertSame( 0, $second['count'] );
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
		$this->assertStringContainsString( 'wp:aggressive-apparel/wishlist', $result['content'] );
	}
}
