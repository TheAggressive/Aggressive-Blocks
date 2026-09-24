<?php
/**
 * Production build contract: every migrated block ships its metadata.
 *
 * @package Aggressive_Blocks\Tests\Unit\Build
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Tests\Unit\Build;

use PHPUnit\Framework\TestCase;

/**
 * Fail closed if a required generated file is missing from build/.
 */
class Build_Contract_Test extends TestCase {

	/**
	 * Required production files after `pnpm ci:build`.
	 *
	 * @return array<string, array{0: string}>
	 */
	public function required_files(): array {
		return array(
			'manifest'            => array( 'build/blocks-manifest.php' ),
			'copyright json'      => array( 'build/blocks/copyright/block.json' ),
			'copyright render'    => array( 'build/blocks/copyright/render.php' ),
			'copyright presets'   => array( 'build/blocks/copyright/legal-entity-presets.json' ),
			'split story'         => array( 'build/blocks/split-story/block.json' ),
			'aos json'            => array( 'build/blocks-interactivity/animate-on-scroll/block.json' ),
			'aos render'          => array( 'build/blocks-interactivity/animate-on-scroll/render.php' ),
			'parallax json'       => array( 'build/blocks-interactivity/parallax/block.json' ),
			'modal json'          => array( 'build/blocks-interactivity/modal/block.json' ),
			'card flip json'      => array( 'build/blocks-interactivity/card-flip/block.json' ),
			'hscroll json'        => array( 'build/blocks-interactivity/horizontal-scroll/block.json' ),
			'hero json'           => array( 'build/blocks-interactivity/hero-carousel/block.json' ),
			'hero motion'         => array( 'build/blocks-interactivity/hero-carousel/motion-variants.json' ),
			'ticker json'         => array( 'build/blocks-interactivity/ticker/block.json' ),
			'debug css'           => array( 'build/styles/debug-overlays.css' ),
			'icons'               => array( 'build/icons/manifest.php' ),
			'helpers module'      => array( 'build/interactivity/helpers.js' ),
			'scroll lock module'  => array( 'build/interactivity/scroll-lock.js' ),
			'helpers asset'       => array( 'build/interactivity/helpers.asset.php' ),
			'scroll lock asset'   => array( 'build/interactivity/scroll-lock.asset.php' ),
		);
	}

	/**
	 * @dataProvider required_files
	 *
	 * @param string $relative Path from the plugin root.
	 * @return void
	 */
	public function test_required_production_file_exists( string $relative ): void {
		$path = dirname( __DIR__, 3 ) . '/' . $relative;
		$this->assertFileExists( $path, $relative . ' must be generated during the production build.' );
	}

	/**
	 * Canonical block names stay under aggressive-blocks/.
	 *
	 * @return void
	 */
	public function test_built_block_json_uses_plugin_namespace(): void {
		$files = glob( dirname( __DIR__, 3 ) . '/build/blocks*/**/block.json' ) ?: array();
		$this->assertNotEmpty( $files );

		foreach ( $files as $file ) {
			$data = json_decode( (string) file_get_contents( $file ), true );
			$this->assertIsArray( $data );
			$this->assertStringStartsWith( 'aggressive-blocks/', (string) ( $data['name'] ?? '' ), $file );
			$this->assertSame( 'aggressive-blocks', $data['textdomain'] ?? '', $file );
		}
	}
}
