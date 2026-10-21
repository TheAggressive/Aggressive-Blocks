<?php
/**
 * Server registration of the editor's global parallax attribute.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Blocks;

use Aggressive_Blocks\Blocks\Parallax_Attributes;
use WP_Block_Type_Registry;
use WP_REST_Request;
use WP_UnitTestCase;

/**
 * @group blocks
 * @group parallax
 */
class Parallax_Attributes_Test extends WP_UnitTestCase {

	/**
	 * Server-rendered previews must accept the attribute the editor adds to
	 * every block (regression: "Invalid attribute: aggressiveApparelParallax
	 * is not a valid property of Object" on Fluent Forms, core Archives, …).
	 */
	public function test_block_renderer_accepts_the_parallax_attribute(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );

		$request = new WP_REST_Request( 'GET', '/wp/v2/block-renderer/core/archives' );
		$request->set_param( 'context', 'edit' );
		$request->set_param(
			'attributes',
			array( Parallax_Attributes::ATTRIBUTE => array( 'enabled' => false ) )
		);

		$response = rest_do_request( $request );

		$this->assertSame( 200, $response->get_status() );
	}

	/**
	 * Registered without a default, so render callbacks never receive it
	 * unless the block saved it.
	 */
	public function test_attribute_has_no_default(): void {
		$block = WP_Block_Type_Registry::get_instance()->get_registered( 'core/archives' );

		$this->assertNotNull( $block );
		$this->assertSame(
			array( 'type' => 'object' ),
			$block->attributes[ Parallax_Attributes::ATTRIBUTE ] ?? null
		);
		$this->assertArrayNotHasKey(
			Parallax_Attributes::ATTRIBUTE,
			$block->prepare_attributes_for_render( array() )
		);
	}

	/**
	 * The parallax container is excluded, as in attributes.ts, and an
	 * existing definition is never overwritten.
	 */
	public function test_own_block_and_existing_definitions_are_left_alone(): void {
		$this->assertSame(
			array( 'title' => 'Parallax' ),
			Parallax_Attributes::add_attribute( array( 'title' => 'Parallax' ), 'aggressive-blocks/parallax' )
		);

		$custom = array( 'type' => 'object', 'default' => array( 'enabled' => true ) );
		$args   = Parallax_Attributes::add_attribute(
			array( 'attributes' => array( Parallax_Attributes::ATTRIBUTE => $custom ) ),
			'acme/block'
		);

		$this->assertSame( $custom, $args['attributes'][ Parallax_Attributes::ATTRIBUTE ] );
	}
}
