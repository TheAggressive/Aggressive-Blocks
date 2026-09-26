<?php
/**
 * Animate On Scroll stagger delays, server side.
 *
 * A port of src/blocks-interactivity/animate-on-scroll/stagger-math.ts. The
 * server writes each child's delay so the entrance a block plays on first
 * paint (before the store hydrates) staggers exactly as the store's later
 * scroll-in does. Keep the two in step: the random pattern must reproduce
 * the TypeScript FNV-1a + Mulberry32 output bit for bit.
 *
 * @package Aggressive_Blocks
 */

declare(strict_types=1);

namespace Aggressive_Blocks\Blocks;

/**
 * Stagger delay math shared with the Animate On Scroll store.
 */
class Stagger {

	private const UINT32 = 0xffffffff;

	/**
	 * FNV-1a 32-bit hash, as hashToSeed() in stagger-math.ts.
	 *
	 * @param string $input Input string.
	 * @return int Unsigned 32-bit hash.
	 */
	public static function hash_to_seed( string $input ): int {
		$hash   = 0x811c9dc5;
		$length = strlen( $input );
		for ( $i = 0; $i < $length; $i++ ) {
			$hash ^= ord( $input[ $i ] );
			$hash  = ( $hash * 0x01000193 ) & self::UINT32;
		}
		return $hash;
	}

	/**
	 * First output of Mulberry32 for a seed, as mulberry32(seed)() in stagger-math.ts.
	 *
	 * @param int $seed Unsigned 32-bit seed.
	 * @return float In [0, 1).
	 */
	public static function mulberry32_first( int $seed ): float {
		$t = ( $seed + 0x6d2b79f5 ) & self::UINT32;
		$r = self::imul( $t ^ ( $t >> 15 ), 1 | $t );
		$r = ( $r ^ ( ( $r + self::imul( $r ^ ( $r >> 7 ), 61 | $r ) ) & self::UINT32 ) ) & self::UINT32;
		return ( ( $r ^ ( $r >> 14 ) ) & self::UINT32 ) / 4294967296;
	}

	/**
	 * Delay in seconds for one child, as getChildStaggerDelay() in stagger-math.ts.
	 *
	 * @param int                  $index  Zero-based child index.
	 * @param int                  $total  Number of children.
	 * @param array<string, mixed> $config pattern, delay, waveFrequency, randomMin, randomMax, seed.
	 * @return float
	 */
	public static function delay( int $index, int $total, array $config ): float {
		$delay = (float) ( $config['delay'] ?? 0.2 );

		switch ( $config['pattern'] ?? 'sequential' ) {
			case 'wave':
				$progress = $index / max( $total - 1, 1 );
				$wave     = ( 1 - cos( $progress * (float) ( $config['waveFrequency'] ?? 1 ) * M_PI ) ) / 2;
				return $wave * $delay * max( $total - 1, 1 ) * 0.5;

			case 'random':
				$min  = (float) ( $config['randomMin'] ?? 0 );
				$max  = (float) ( $config['randomMax'] ?? 0.5 );
				$seed = ( (int) ( $config['seed'] ?? 0 ) ) & self::UINT32;
				$rand = self::mulberry32_first( self::hash_to_seed( $seed . ':' . $index ) );
				return min( $min, $max ) + $rand * ( max( $min, $max ) - min( $min, $max ) );

			case 'sequential':
			default:
				return $index * $delay;
		}
	}

	/**
	 * Low 32 bits of a 32-bit by 32-bit product, as Math.imul() (unsigned).
	 *
	 * Split so no intermediate exceeds a 64-bit integer.
	 *
	 * @param int $a Unsigned 32-bit operand.
	 * @param int $b Unsigned 32-bit operand.
	 * @return int
	 */
	private static function imul( int $a, int $b ): int {
		$a  &= self::UINT32;
		$b  &= self::UINT32;
		$low = $a * ( $b & 0xffff );
		$hi  = ( ( $a * ( $b >> 16 ) ) & 0xffff ) << 16;
		return ( $low + $hi ) & self::UINT32;
	}
}
