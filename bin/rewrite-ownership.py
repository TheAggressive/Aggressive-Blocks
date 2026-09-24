#!/usr/bin/env python3
"""Apply ownership-only namespace rewrites to copied theme sources."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

BLOCK_SLUGS = [
    "card-flip-front",
    "card-flip-back",
    "card-flip",
    "split-story-media",
    "split-story-content",
    "split-story",
    "animate-on-scroll",
    "horizontal-scroll",
    "hero-carousel",
    "parallax",
    "modal",
    "ticker",
    "copyright",
]

SKIP_PARTS = {
    "node_modules",
    "vendor",
    "build",
    ".git",
}


def should_skip(path: Path) -> bool:
    return any(part in SKIP_PARTS for part in path.parts)


def rewrite_text(text: str) -> str:
    for slug in BLOCK_SLUGS:
        text = text.replace(f"aggressive-apparel/{slug}", f"aggressive-blocks/{slug}")

    text = text.replace('"textdomain": "aggressive-apparel"', '"textdomain": "aggressive-blocks"')
    text = text.replace(", 'aggressive-apparel'", ", 'aggressive-blocks'")
    text = text.replace(', "aggressive-apparel"', ', "aggressive-blocks"')

    text = text.replace("namespace Aggressive_Apparel", "namespace Aggressive_Blocks")
    text = text.replace("use Aggressive_Apparel\\", "use Aggressive_Blocks\\")
    text = text.replace("\\Aggressive_Apparel\\", "\\Aggressive_Blocks\\")
    text = text.replace("@package Aggressive_Apparel", "@package Aggressive_Blocks")
    text = text.replace("Aggressive_Apparel\\Tests\\", "Aggressive_Blocks\\Tests\\")

    text = text.replace("aggressive_apparel_get_icon", "aggressive_blocks_get_icon")
    text = text.replace("aggressive_apparel_render_icon", "aggressive_blocks_render_icon")
    text = text.replace("aggressive_apparel_trusted_html", "aggressive_blocks_trusted_html")
    text = text.replace(
        "aggressive_apparel_can_view_block_debug",
        "aggressive_blocks_can_view_block_debug",
    )
    text = text.replace(
        "aggressive_apparel_enqueue_block_debug_assets",
        "aggressive_blocks_enqueue_block_debug_assets",
    )

    text = text.replace("AGGRESSIVE_APPAREL_DIR", "AGGRESSIVE_BLOCKS_DIR")
    text = text.replace("AGGRESSIVE_APPAREL_URI", "AGGRESSIVE_BLOCKS_URI")
    text = text.replace("AGGRESSIVE_APPAREL_VERSION", "AGGRESSIVE_BLOCKS_VERSION")

    text = text.replace("aggressive-apparel/v1", "aggressive-blocks/v1")
    text = text.replace("@aggressive-apparel/", "@aggressive-blocks/")

    text = text.replace(
        "from '../../interactivity/scroll-lock'",
        "from '@aggressive-blocks/scroll-lock'",
    )
    text = text.replace(
        "from '../../interactivity/helpers'",
        "from '@aggressive-blocks/helpers'",
    )

    # Restore the shared debug-gate filter name after the function rename.
    text = text.replace(
        "'aggressive_blocks_can_view_block_debug'",
        "'aggressive_apparel_can_view_block_debug'",
    )
    text = text.replace(
        '"aggressive_blocks_can_view_block_debug"',
        '"aggressive_apparel_can_view_block_debug"',
    )

    return text


def main() -> None:
    changed = 0
    for path in ROOT.rglob("*"):
        if not path.is_file() or should_skip(path):
            continue
        if path.suffix not in {
            ".php",
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".json",
            ".css",
            ".md",
        }:
            continue
        if path.name in {"rewrite-ownership.py", "package.json", "composer.json"}:
            continue
        original = path.read_text(encoding="utf-8")
        updated = rewrite_text(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
            print(path.relative_to(ROOT))
    print(f"rewrote {changed} files")


if __name__ == "__main__":
    main()
