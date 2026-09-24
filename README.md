# Aggressive Blocks

Reusable Gutenberg blocks extracted from the Aggressive Apparel WordPress theme.

The plugin is developed and tested against WordPress VIP Coding Standards. It is **not** WordPress VIP certified unless Automattic has issued that approval.

## Requirements

* WordPress 6.7 or later
* PHP 8.2 or later
* Node 24 and pnpm 11 for development

## Local quality gate

```bash
pnpm install --frozen-lockfile
composer install
pnpm qa
```

`pnpm qa` is the local equivalent of the merge gate. Use `pnpm qa:fast` before push for the subset that does not start containers.

See [docs/ci.md](docs/ci.md) for workflows, required branch checks, the PHP/WordPress matrix, packaging, and VIP-oriented gates.

## Build

```bash
pnpm build
```

The production build emits block assets, Interactivity API modules, PHP render files, `*.asset.php` sidecars, icons, and `build/blocks-manifest.php`. Runtime never compiles these files.

## Package

```bash
pnpm ci:package
```

The ZIP is allowlist-built and verified. Install that ZIP — not the source checkout — to confirm a release.
