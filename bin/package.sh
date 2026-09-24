#!/usr/bin/env bash
# Build an installable plugin zip that does not include src/ or node_modules/.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f build/blocks-manifest.php ]]; then
	echo "Missing build/blocks-manifest.php. Run pnpm build first." >&2
	exit 1
fi

required=(
	build/blocks/copyright/block.json
	build/blocks/copyright/render.php
	build/blocks/copyright/legal-entity-presets.json
	build/blocks/split-story/block.json
	build/blocks/split-story-media/block.json
	build/blocks/split-story-content/block.json
	build/blocks-interactivity/animate-on-scroll/block.json
	build/blocks-interactivity/animate-on-scroll/render.php
	build/blocks-interactivity/parallax/block.json
	build/blocks-interactivity/parallax/render.php
	build/blocks-interactivity/modal/block.json
	build/blocks-interactivity/modal/render.php
	build/blocks-interactivity/card-flip/block.json
	build/blocks-interactivity/card-flip/render.php
	build/blocks-interactivity/card-flip-front/block.json
	build/blocks-interactivity/card-flip-back/block.json
	build/blocks-interactivity/horizontal-scroll/block.json
	build/blocks-interactivity/horizontal-scroll/render.php
	build/blocks-interactivity/hero-carousel/block.json
	build/blocks-interactivity/hero-carousel/render.php
	build/blocks-interactivity/hero-carousel/motion-variants.json
	build/blocks-interactivity/ticker/block.json
	build/blocks-interactivity/ticker/render.php
	build/styles/debug-overlays.css
	build/icons/manifest.php
	build/interactivity/helpers.js
	build/interactivity/scroll-lock.js
	build/blocks-manifest.php
	aggressive-blocks.php
)

for file in "${required[@]}"; do
	if [[ ! -e "$file" ]]; then
		echo "Missing required production file: $file" >&2
		exit 1
	fi
done

version="$(grep -m1 'Version:' aggressive-blocks.php | awk '{print $NF}')"
out="aggressive-blocks-${version}.zip"
rm -f "$out"

zip -r "$out" \
	aggressive-blocks.php \
	readme.txt \
	includes \
	build \
	languages \
	-x '*.map' \
	-x '*/.git/*'

if unzip -l "$out" | grep -E 'src/|node_modules/' >/dev/null; then
	echo "Package unexpectedly contains src/ or node_modules/." >&2
	exit 1
fi

echo "Wrote $out"
