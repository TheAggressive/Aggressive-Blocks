# 1.x → 2.0 saved-content contract

Block content saved in posts, templates, template parts, patterns and block widgets outlives any release. 2.0 removed the `aggressive-apparel/*` names that 1.x kept as hidden aliases, so content saved under those names does not render until it is migrated:

```bash
wp aggressive-blocks migrate-blocks --dry-run
wp aggressive-blocks migrate-blocks
```

This document states what that migration guarantees and how the guarantees are tested.

## What the migration changes

For each block in `Block_Renamer::SLUGS` (animate-on-scroll, parallax, modal, card-flip and its front/back faces, horizontal-scroll, hero-carousel, ticker, split-story and its media/content columns, copyright):

1. The name in its opening, closing, or void delimiter: `aggressive-apparel/{slug}` becomes `aggressive-blocks/{slug}`.
2. The class the editor generates from that name, `wp-block-aggressive-apparel-{slug}`, on the root element of the block's own saved HTML. Only card-flip faces, split-story and its columns, and the 1.x modal save a wrapper element. Without this change the 2.0 editor reports those blocks as invalid. It is the same markup the 2.0 editor saves.

## What it never changes

Every other byte is copied through unchanged:

* Attribute JSON, including escapes (`\/`, `\u0026`), empty objects, and JSON the parser cannot read.
* Blocks owned by anything else: core (including the explicit `core/` namespace), WooCommerce, and the Aggressive Apparel theme's own `aggressive-apparel/*` blocks.
* Inner HTML, inner blocks, and the whitespace between them.
* Text that only mentions a legacy name: paragraphs, code, attribute values, HTML comments, data attributes, class names.
* Blocks already named `aggressive-blocks/*`. A second run changes nothing.

`Block_Renamer` finds delimiters with `WP_Block_Processor`, the same grammar `parse_blocks()` uses, and splices only the spans above. It does not parse and re-serialize the document, because re-serializing rewrites attributes and blocks it does not own.

The command writes posts with `wp_update_post()`. It slashes the content first, because that function strips one level of backslashes. It also suspends kses for the write, because WP-CLI runs without a user and kses would re-serialize every block in the post. Block widgets are rewritten in the `widget_block` option.

One limit is inherent to the block grammar: a literal, unescaped `<!-- wp:aggressive-apparel/… -->` inside a Custom HTML block is a real delimiter to both WordPress and the editor, so it is migrated like any other.

## Fixtures

`tests/fixtures/migration/legacy/` holds 1.x serializations. `tests/fixtures/migration/migrated/` holds the reviewed output for each one. Each golden differs from its input only in the names and classes listed above.

| Fixture | Source | Covers |
| --- | --- | --- |
| `part-header.html` | Aggressive Apparel `parts/header.html` at `dea7df4^` | ticker, theme navigation blocks |
| `part-footer.html` | Aggressive Apparel `parts/footer.html` at `dea7df4^` | copyright, `\u00a9` escape |
| `template-single-product.html` | Aggressive Apparel `templates/single-product.html` at `dea7df4^` | split-story family, WooCommerce and theme product blocks |
| `pattern-*.html` | Aggressive Apparel patterns at `dea7df4^`, rendered (they only call `esc_html__()`) | animate-on-scroll, parallax, hero-carousel, horizontal-scroll, split-story |
| `pattern-fabric-reveal-trio.html` | Aggressive Apparel pattern at `13efab8^` | card-flip and faces, malformed attribute JSON on a core block |
| `modal-1x-save.html` | Serialized in the editor from the 1.0.0 modal `save()` and supports (the modal's `v2` deprecation), under the legacy name | modal wrapper markup |
| `edge-cases.html` | Hand-written | look-alike text, other owners' blocks, escapes, empty objects, void blocks |

`dea7df4` is the theme commit that moved these blocks to this plugin, so its parent is the last theme revision that saved them under the old names. The modal never appeared in theme templates, which is why its fixture comes from the released `save()`.

Add a fixture when a block gains saved markup, a deprecation, or a known historical shape. Generate its golden with `Block_Renamer::rewrite()` and review the diff: only the names and wrapper classes may change.

## Tests

* `tests/Unit/Migration/Block_Renamer_Test.php`: every moved slug appears in a fixture. For each fixture: the output matches its golden file, and the parsed tree keeps its shape, attributes and HTML apart from the rename. Migrated content only uses registered block names and never migrates again. Look-alike text, other owners' blocks, and unparseable JSON stay byte for byte.
* `tests/Integration/Migration_Cli_Test.php`: runs the command as WP-CLI does (no user, kses active) over posts and block widgets. It asserts that the stored content equals the rewrite, that `--dry-run` writes nothing, and that a rerun is a no-op.
* `tests/e2e/migration.spec.ts`: in the block editor, legacy content is missing without migration. Migrated content keeps the same plugin blocks, none of them missing, and no block that was valid under the 1.x names (registered as 1.0.0 registered them) becomes invalid.
