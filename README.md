# Aggressive Blocks

Reusable Gutenberg blocks extracted from the Aggressive Apparel WordPress theme.

The plugin is developed and tested against WordPress VIP Coding Standards. It is **not** WordPress VIP certified unless Automattic has issued that approval.

## Requirements

* WordPress 7.0 or later
* PHP 8.2 or later
* Node 24 and pnpm 11 for development

## Local development

WordPress Studio is the local site. GitHub Actions runs the Docker lanes.

```bash
pnpm install --frozen-lockfile
composer install
pnpm qa:fast
```

`pnpm qa:fast` is the pre-push check. It does not start containers. `pnpm qa` rehearses the same wp-env lanes CI runs.

For browser tests without Docker, `pnpm test:e2e:studio` runs Playwright against your Studio site. Opt the site in once with `touch <site>/.aggressive-blocks-e2e-site`; the script restores everything it changes. Pass Playwright arguments through, e.g. `pnpm test:e2e:studio tests/e2e/modal.spec.ts`.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Release notes live on the [Releases page](https://github.com/TheAggressive/Aggressive-Blocks/releases).

See [docs/ci.md](docs/ci.md) for workflows, required branch checks, the PHP/WordPress matrix, packaging, and VIP-oriented gates.

## Migrating from Aggressive Apparel

2.0.0 removed the `aggressive-apparel/*` block names that 1.x kept as hidden aliases. Content that still uses them does not render. Rewrite it to `aggressive-blocks/*` before updating:

```bash
wp aggressive-blocks migrate-blocks --dry-run
wp aggressive-blocks migrate-blocks
```

The command walks posts and widgets with `parse_blocks()`, only renames the blocks this plugin owns, and is safe to rerun.

## Build

```bash
pnpm build
```

The production build emits block assets, Interactivity API modules, PHP render files, `*.asset.php` sidecars, icons, and `build/blocks-manifest.php`. Runtime never compiles these files.

## Package

CI builds an allowlisted ZIP and installs that ZIP, not the source checkout, before a release is published. Merging to `main` does not publish. A release is a manual CI run on `main` with publish enabled.
