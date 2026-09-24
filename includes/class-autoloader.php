<?php
/**
 * Autoloader for Aggressive Blocks classes.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks;

/**
 * PSR-4-style WordPress classmap autoloader.
 */
class Autoloader {

	/**
	 * Plugin namespace.
	 *
	 * @var string
	 */
	private string $namespace = 'Aggressive_Blocks';

	/**
	 * Base directory for classes.
	 *
	 * @var string
	 */
	private string $base_dir;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->base_dir = __DIR__ . '/';
		spl_autoload_register( array( $this, 'autoload' ) );
	}

	/**
	 * Autoload plugin classes.
	 *
	 * @param string $class_name Fully-qualified class name.
	 * @return void
	 */
	public function autoload( string $class_name ): void {
		$len = strlen( $this->namespace );
		if ( strncmp( $this->namespace, $class_name, $len ) !== 0 ) {
			return;
		}

		$relative_class = ltrim( substr( $class_name, $len ), '\\' );
		$parts          = explode( '\\', $relative_class );
		$classname      = array_pop( $parts );
		$subdirs        = implode( '/', $parts );
		if ( '' !== $subdirs ) {
			$subdirs .= '/';
		}

		$filename = 'class-' . str_replace( '_', '-', strtolower( $classname ) ) . '.php';
		$file     = $this->base_dir . $subdirs . $filename;

		if ( file_exists( $file ) ) {
			require_once $file;
		}
	}
}
