<?php
/**
 * Decorative ticker copies preserve visuals without duplicate identity.
 *
 * @package Aggressive_Blocks\Tests\Unit\Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Blocks;

use Aggressive_Blocks\Blocks\Decorative_Copy;
use WP_UnitTestCase;

class Decorative_Copy_Test extends WP_UnitTestCase {

	public function test_copy_cannot_hydrate_or_duplicate_ids(): void {
		$html = '<section id="cart" data-wp-interactive="cart" data-wp-context="{}"><span id="count" aria-live="polite" aria-atomic="true" data-wp-text="state.count" class="price" style="color:red">3</span></section>';
		$copy = Decorative_Copy::sanitize( $html );
		$this->assertStringNotContainsString( 'id=', $copy );
		$this->assertStringNotContainsString( 'data-wp-', $copy );
		$this->assertStringNotContainsString( 'aria-live', $copy );
		$this->assertStringNotContainsString( 'aria-atomic', $copy );
		$this->assertStringContainsString( 'class="price" style="color:red">3', $copy );
	}
}
