=== Aggressive Blocks ===
Contributors: theaggressivenetwork
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Reusable Gutenberg blocks extracted from Aggressive Apparel.

== Description ==

Aggressive Blocks registers the reusable block families that previously shipped with the Aggressive Apparel theme. The plugin is self-contained: it does not require that theme, WooCommerce, or any other Aggressive Apparel code.

Developed and tested against WordPress VIP Coding Standards. This is not a WordPress VIP certification claim.

== Changelog ==

Release notes for every version are published on the [GitHub Releases page](https://github.com/TheAggressive/Aggressive-Blocks/releases).

= 1.0.0 =
* Initial standalone plugin release.

== Upgrade Notice ==

= 2.0.0 =
Removes the aggressive-apparel/* block names. Before updating, run `wp aggressive-blocks migrate-blocks --dry-run`, then `wp aggressive-blocks migrate-blocks`, on every site. Content that still uses an old name stops rendering after the update.
