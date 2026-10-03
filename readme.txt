=== Aggressive Blocks ===
Contributors: theaggressivenetwork
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 2.1.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Reusable Gutenberg blocks extracted from Aggressive Apparel.

== Description ==

Aggressive Blocks registers the reusable block families that previously shipped with the Aggressive Apparel theme. The plugin is self-contained: it does not require that theme, WooCommerce, or any other Aggressive Apparel code.

Developed and tested against WordPress VIP Coding Standards. This is not a WordPress VIP certification claim.

= Updates =

From 2.1.0, new releases appear under Plugins and Dashboard → Updates like any other plugin's updates, and follow your auto-update setting. They come from the plugin's [GitHub releases](https://github.com/TheAggressive/Aggressive-Blocks/releases), never from WordPress.org. Each package is checked against its release's SHA-256 checksum before it is installed, and an update that fails the check is not installed.

The updater stays off, and makes no network requests, when the plugin is a git checkout, when `WP_ENVIRONMENT_TYPE` is `local` or `development`, or when `DISALLOW_FILE_MODS` is set (as on WordPress VIP). The `aggressive_blocks_enable_updates` filter can turn it off anywhere.

= Migrating from 1.x =

2.0.0 removed the `aggressive-apparel/*` block names. Before updating from 1.x, run `wp aggressive-blocks migrate-blocks --dry-run`, then `wp aggressive-blocks migrate-blocks`. It renames only this plugin's blocks and leaves everything else as saved.

== Changelog ==

Release notes for every version are published on the [GitHub Releases page](https://github.com/TheAggressive/Aggressive-Blocks/releases).

== Upgrade Notice ==

= 2.1.0 =
Adds updates from verified GitHub releases. Install this version manually once; from then on, updates appear in wp-admin.

= 2.0.0 =
Removes the aggressive-apparel/* block names. Before updating, run `wp aggressive-blocks migrate-blocks --dry-run`, then `wp aggressive-blocks migrate-blocks`, on every site. Content that still uses an old name stops rendering after the update.
