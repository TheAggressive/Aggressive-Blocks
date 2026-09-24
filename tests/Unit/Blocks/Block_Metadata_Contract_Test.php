<?php
/**
 * Source metadata contracts that prevent extraction drift.
 *
 * @package Aggressive_Blocks\Tests\Unit\Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Blocks;

use PHPUnit\Framework\TestCase;

/**
 * Attribute, parent, and allowedBlocks contracts for migrated families.
 */
class Block_Metadata_Contract_Test extends TestCase {

	/**
	 * @return array<string, array{0: string, 1: string}>
	 */
	public function expected_names(): array {
		return array(
			'aos'           => array( 'src/blocks-interactivity/animate-on-scroll/block.json', 'aggressive-blocks/animate-on-scroll' ),
			'parallax'      => array( 'src/blocks-interactivity/parallax/block.json', 'aggressive-blocks/parallax' ),
			'modal'         => array( 'src/blocks-interactivity/modal/block.json', 'aggressive-blocks/modal' ),
			'card-flip'     => array( 'src/blocks-interactivity/card-flip/block.json', 'aggressive-blocks/card-flip' ),
			'card-front'    => array( 'src/blocks-interactivity/card-flip-front/block.json', 'aggressive-blocks/card-flip-front' ),
			'card-back'     => array( 'src/blocks-interactivity/card-flip-back/block.json', 'aggressive-blocks/card-flip-back' ),
			'hscroll'       => array( 'src/blocks-interactivity/horizontal-scroll/block.json', 'aggressive-blocks/horizontal-scroll' ),
			'hero'          => array( 'src/blocks-interactivity/hero-carousel/block.json', 'aggressive-blocks/hero-carousel' ),
			'ticker'        => array( 'src/blocks-interactivity/ticker/block.json', 'aggressive-blocks/ticker' ),
			'split'         => array( 'src/blocks/split-story/block.json', 'aggressive-blocks/split-story' ),
			'split-media'   => array( 'src/blocks/split-story-media/block.json', 'aggressive-blocks/split-story-media' ),
			'split-content' => array( 'src/blocks/split-story-content/block.json', 'aggressive-blocks/split-story-content' ),
			'copyright'     => array( 'src/blocks/copyright/block.json', 'aggressive-blocks/copyright' ),
		);
	}

	/**
	 * @dataProvider expected_names
	 *
	 * @param string $relative Source block.json path.
	 * @param string $name     Canonical block name.
	 * @return void
	 */
	public function test_source_block_name_and_category( string $relative, string $name ): void {
		$data = $this->read_json( $relative );
		$this->assertSame( $name, $data['name'] );
		$this->assertSame( 'aggressive-apparel', $data['category'] );
		$this->assertSame( 'aggressive-blocks', $data['textdomain'] );
	}

	/**
	 * Card-flip faces stay parented; hero carousel still only allows Cover.
	 *
	 * @return void
	 */
	public function test_parent_and_allowed_blocks_contracts(): void {
		$card = $this->read_json( 'src/blocks-interactivity/card-flip/block.json' );
		$this->assertSame(
			array( 'aggressive-blocks/card-flip-front', 'aggressive-blocks/card-flip-back' ),
			$card['allowedBlocks']
		);

		$front = $this->read_json( 'src/blocks-interactivity/card-flip-front/block.json' );
		$this->assertSame( array( 'aggressive-blocks/card-flip' ), $front['parent'] );

		$hero = $this->read_json( 'src/blocks-interactivity/hero-carousel/block.json' );
		$this->assertSame( array( 'core/cover' ), $hero['allowedBlocks'] );

		$split = $this->read_json( 'src/blocks/split-story/block.json' );
		$this->assertSame(
			array( 'aggressive-blocks/split-story-media', 'aggressive-blocks/split-story-content' ),
			$split['allowedBlocks']
		);
	}

	/**
	 * @param string $relative Path from plugin root.
	 * @return array<string, mixed>
	 */
	private function read_json( string $relative ): array {
		$path = dirname( __DIR__, 3 ) . '/' . $relative;
		$data = json_decode( (string) file_get_contents( $path ), true );
		$this->assertIsArray( $data, $relative );
		return $data;
	}
}
