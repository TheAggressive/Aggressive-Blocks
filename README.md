# Aggressive Blocks

Reusable Gutenberg blocks extracted from the Aggressive Apparel WordPress theme.

The plugin is developed and tested against WordPress VIP Coding Standards. It is **not** WordPress VIP certified unless Automattic has issued that approval.

## Requirements

* WordPress 6.7 or later
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

See [docs/ci.md](docs/ci.md) for workflows, required branch checks, the PHP/WordPress matrix, packaging, and VIP-oriented gates.

## Build

```bash
pnpm build
```

The production build emits block assets, Interactivity API modules, PHP render files, `*.asset.php` sidecars, icons, and `build/blocks-manifest.php`. Runtime never compiles these files.

## Package

CI builds an allowlisted ZIP and installs that ZIP, not the source checkout, before a release is published. Merging to `main` does not publish. A release is a manual CI run on `main` with publish enabled.
