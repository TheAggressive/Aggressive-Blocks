#!/usr/bin/env bash
#
# Allowlist for the distributable plugin ZIP.

# shellcheck disable=SC2034
AA_PLUGIN_SLUG='aggressive-blocks'

# shellcheck disable=SC2034
AA_PACKAGE_INCLUDE=(
	'aggressive-blocks.php'
	'readme.txt'
	'LICENSE'
	'build'
	'includes'
	'languages'
)

# shellcheck disable=SC2034
AA_PACKAGE_REQUIRED=(
	'aggressive-blocks.php'
	'readme.txt'
	'LICENSE'
	'includes/class-autoloader.php'
	'includes/class-plugin.php'
	'includes/helpers.php'
	'includes/Blocks/class-blocks.php'
	'includes/Blocks/class-copyright.php'
	'includes/Blocks/class-icon-block.php'
	'includes/Migration/class-block-renamer.php'
	'includes/Migration/class-cli.php'
	'build/blocks-manifest.php'
	'build/blocks/copyright/block.json'
	'build/blocks/copyright/render.php'
	'build/blocks/copyright/legal-entity-presets.json'
	'build/blocks/split-story/block.json'
	'build/blocks/split-story-media/block.json'
	'build/blocks/split-story-content/block.json'
	'build/blocks-interactivity/animate-on-scroll/block.json'
	'build/blocks-interactivity/animate-on-scroll/render.php'
	'build/blocks-interactivity/parallax/block.json'
	'build/blocks-interactivity/parallax/render.php'
	'build/blocks-interactivity/modal/block.json'
	'build/blocks-interactivity/modal/render.php'
	'build/blocks-interactivity/card-flip/block.json'
	'build/blocks-interactivity/card-flip/render.php'
	'build/blocks-interactivity/card-flip-front/block.json'
	'build/blocks-interactivity/card-flip-back/block.json'
	'build/blocks-interactivity/horizontal-scroll/block.json'
	'build/blocks-interactivity/horizontal-scroll/render.php'
	'build/blocks-interactivity/hero-carousel/block.json'
	'build/blocks-interactivity/hero-carousel/render.php'
	'build/blocks-interactivity/hero-carousel/motion-variants.json'
	'build/blocks-interactivity/ticker/block.json'
	'build/blocks-interactivity/ticker/render.php'
	'build/styles/debug-overlays.css'
	'build/icons/manifest.php'
	'languages/aggressive-blocks.pot'
)

# shellcheck disable=SC2034
AA_PACKAGE_PRUNE=(
	'languages/README.md'
)

# shellcheck disable=SC2034
AA_PACKAGE_FORBIDDEN=(
	'src/'
	'node_modules/'
	'vendor/'
	'tests/'
	'coverage/'
	'.github/'
	'bin/'
	'.git/'
	'.env'
	'.env.local'
	'composer.json'
	'composer.lock'
	'package.json'
	'pnpm-lock.yaml'
	'phpunit.xml.dist'
	'phpcs.xml.dist'
	'phpstan.neon'
	'playwright.config.ts'
)

aa_plugin_header_version() {
	local file="${1:?}"
	sed -n 's/^ \* Version:[[:space:]]*\([^[:space:]]*\).*$/\1/p' "${file}" | head -n 1
}

# The AGGRESSIVE_BLOCKS_VERSION constant in the plugin's main file.
aa_plugin_constant_version() {
	local file="${1:?}"
	sed -n "s/^define( 'AGGRESSIVE_BLOCKS_VERSION', '\([^']*\)' );\$/\1/p" "${file}" | head -n 1
}

# The Stable tag in readme.txt.
aa_readme_stable_tag() {
	local file="${1:?}"
	sed -n 's/^Stable tag:[[:space:]]*\([^[:space:]]*\).*$/\1/p' "${file}" | head -n 1
}

# Write a version everywhere the plugin declares one, under a plugin root: the
# header WordPress reads, the constant the code reads, and the readme's Stable
# tag. Fails unless all three read back as the version afterwards.
aa_stamp_version() {
	local root="${1:?}"
	local version="${2:?}"
	local plugin="${root}/aggressive-blocks.php"
	local readme="${root}/readme.txt"

	sed -i "s/^ \* Version:[[:space:]].*\$/ * Version:           ${version}/" "${plugin}"
	sed -i "s/^define( 'AGGRESSIVE_BLOCKS_VERSION', '[^']*' );\$/define( 'AGGRESSIVE_BLOCKS_VERSION', '${version}' );/" "${plugin}"
	sed -i "s/^Stable tag:[[:space:]].*\$/Stable tag: ${version}/" "${readme}"

	if [[ "$(aa_plugin_header_version "${plugin}")" != "${version}" ||
		"$(aa_plugin_constant_version "${plugin}")" != "${version}" ||
		"$(aa_readme_stable_tag "${readme}")" != "${version}" ]]; then
		echo "Version ${version} did not apply to the header, constant, and Stable tag under ${root}." >&2
		return 1
	fi
}
