# CI/CD and quality gates

Aggressive Blocks is developed and tested against WordPress VIP Coding Standards. That is demonstrated by automated checks, not by a certification claim.

This document is the contract between local development, GitHub Actions, and the protected `main` branch.

## Supported versions

| Surface | Version | Enforced by |
| --- | --- | --- |
| PHP floor | 8.2 | plugin header, `composer.json`, `phpstan.neon`, `bin/ci/.wp-env.json` |
| WordPress floor | 7.0+ | plugin header, floor lane (`pnpm ci:floor`) on WordPress 7.0 with PHP 8.2 |
| Primary CI WordPress | 7.1.2 | `bin/ci/.wp-env.json` |
| Browsers | Chromium: every E2E test. WebKit: tests tagged `@webkit` (focus and `inert`, `<dialog>`, scroll and scroll-driven animation, pointer input, reduced motion) | `playwright.config.ts` |
| Node | 24.18.0 | `.node-version`, `bin/ci/node.sh`, workflow `NODE_VERSION` |
| pnpm | 11.21.0 | `packageManager` |

Forward PHP 8.3/8.4 and WordPress Beta/RC run on a schedule. They are early-warning signals and do not block merges.

## Merge gates

Required check names are a small stable set. The branch ruleset must require exactly these:

* **CI Summary** — aggregate of the `CI/CD Pipeline` workflow
* **Actionlint** — workflow syntax
* **Zizmor** — workflow security
* **PR Policy** — Conventional Commit title and fail-closed auto-merge
* **CodeQL** — native code-scanning rule for authored JavaScript/TypeScript

Do not add dozens of job names to branch protection. The summary job is the merge contract for the pipeline.

On production-code changes the pipeline runs these lanes:

1. Change classification (`bin/ci/classify-changes.mjs`)
2. Frontend lane (`pnpm ci:frontend`)
3. i18n lane (`pnpm ci:i18n`): builds first, because script strings are extracted from `build/` so `make-json` catalogs match the enqueued files
4. Canonical production build (`pnpm ci:build`), then the frontend asset budgets
5. PHP lane (`pnpm ci:php`) against the same build artifact
6. Playwright E2E against WordPress + this plugin + Twenty Twenty-Five
7. Allowlist ZIP (`pnpm ci:package`)
8. Artifact acceptance: install that ZIP and re-run E2E (`pnpm ci:artifact`)
9. WordPress floor: install that ZIP on the declared minimum WordPress and PHP (`pnpm ci:floor`)

Lanes wait only for the inputs they use. After classification, the frontend, i18n and build lanes start together. Once the build is uploaded, PHP, E2E and packaging start together, and artifact acceptance and the WordPress floor follow packaging. Nothing is dropped by running in parallel: the summary job and the release job each require every lane to pass.

The two browser lanes are split into two parallel shards (`AA_E2E_SHARD=1/2`, `2/2`). Each shard starts its own WordPress and runs one worker, so tests never share site state. Playwright keeps each spec file in one shard. Run locally without `AA_E2E_SHARD`, a lane runs the whole suite.

Documentation-only and translation-only diffs skip expensive lanes. The summary job still fails if a required lane is skipped when it should have run.

## Local equivalents

| Gate | Local command |
| --- | --- |
| Full merge rehearsal | `pnpm qa` |
| Fast pre-push subset | `pnpm qa:fast` |
| Frontend lint/type/unit/contracts/audit | `pnpm ci:frontend` |
| PHPCS + VIPCS + PHPStan + PHPUnit | `pnpm ci:php` |
| i18n POT/catalog check | `pnpm ci:i18n` or `pnpm i18n:check` |
| Production build | `pnpm ci:build` |
| Isolated E2E (Docker) | `pnpm ci:e2e` |
| E2E against the Studio site | `pnpm test:e2e:studio` |
| ZIP + verify | `pnpm ci:package` |
| ZIP install proof | `pnpm ci:artifact` |
| Declared WordPress/PHP floor | `pnpm ci:floor` |
| Aggressive Apparel with the ZIP | `AB_THEME_DIR=<built theme checkout> pnpm ci:integration` |
| Screenshot regression | `pnpm ci:visual` (`AB_VISUAL_UPDATE=1` rewrites the baselines) |
| PHPUnit only | `pnpm test:php` |
| Tool/contract tests | `pnpm test:tools` |

Day-to-day development uses WordPress Studio. `pnpm qa:fast` is the local pre-push check and does not start containers. `pnpm qa` rehearses the containerized CI lanes: it routes through the same pinned Node as Actions (`bin/ci/node.sh`) and then `bin/ci/verify.sh`.

`pnpm test:e2e:studio` runs the Playwright suite against the Studio site that serves this checkout, with no Docker. `bin/local/studio-e2e.sh` finds the site, logs in with Studio's auto-login URL, and for the length of the run switches to Twenty Twenty-Five and hides the admin bar. It records both first and restores them afterwards, even after a killed run. The site must opt in once with `touch <site>/.aggressive-blocks-e2e-site`. It runs other plugins and its own theme, so a local pass is a fast signal; the wp-env lane in CI remains the release proof.

## Independent-site proof

`bin/ci/.wp-env.json` maps only this plugin. E2E activates Twenty Twenty-Five. Aggressive Apparel and WooCommerce are not installed.

Artifact acceptance installs the generated ZIP into a second wp-env that does **not** map plugin source. A green artifact lane means the packaged plugin works without the source checkout or the source theme.

## Frontend assets

`pnpm ci:build` ends with `bin/check-bundle-size.mjs`. Every script module and stylesheet a visitor can download (block view modules, block stylesheets and their RTL copies, the shared `@aggressive-blocks/*` modules, the debug chunks, the debug overlay stylesheet) has a gzip budget in `bin/bundle-budgets.json`. Each budget is the size measured when it was set plus about 15%: room for ordinary changes, but not for a new dependency. The check fails when:

* a file grows past its budget;
* the build emits a frontend asset with no budget, so a new block has to add one;
* a budgeted file disappears, so a renamed output cannot escape its budget;
* a view module imports anything but `@wordpress/interactivity` and the plugin's own modules.

Raise a budget only for a deliberate change, and say why in the commit.

Block assets load through `block.json` and WordPress's on-demand block asset loading; the plugin has no loader of its own. `tests/e2e/asset-loading.spec.ts` checks this as an anonymous visitor. A page of core blocks requests, links, inlines, and import-maps nothing from the plugin, and a page with one Modal loads only the Modal's stylesheet and view module.

## WordPress floor

`Requires at least` and `Requires PHP` in the plugin header are claims. The floor lane (`bin/ci/wp-floor.sh`) proves them on every code change, since the primary environment runs a newer WordPress.

It reads both values from the header, so there is no second pin to drift. It installs the release ZIP on the first release of that WordPress branch (7.0 means 7.0.0) and, in CI, refuses to run on any PHP but the declared one (8.2). Then it checks that:

* the plugin activates on Twenty Twenty-Five, and every block in `build/blocks-manifest.php` registers;
* `independent-site.spec.ts` and `copyright.spec.ts` pass: the blocks are in the inserter and the server-rendered Copyright block renders;
* `hero-carousel.spec.ts` passes. Its deep links depend on WordPress 7.0 writing a dynamic block's anchor as its `id`, which is why the floor is 7.0. On 6.9 the deep-link and autoplay tests fail, and WordPress refuses to install the ZIP.
* PHP logs no error, warning, notice, or deprecation.

Raising the floor means changing the header (and `readme.txt`); the lane then tests the new branch. Lowering it only works if this lane passes there.

## Visual regression

`tests/visual` holds one screenshot per canonical state: Hero Carousel, Ticker, Card Flip front and back, Split Story, Horizontal Scroll at its first slide, and an open Modal. Hero, Split Story, Horizontal Scroll and the Modal also run at a phone viewport, where their layout changes. Animate On Scroll and Parallax are left out: at rest, and under reduced motion, they are plain content, and their behavior is already covered by E2E.

A screenshot only means something if the environment that made its baseline is the one that checks it. So `pnpm ci:visual` (`bin/ci/visual.sh`) never runs in the Studio or wp-env lanes. It installs the release ZIP on the primary CI WordPress with Twenty Twenty-Five, natively, and captures in Playwright's Chromium with fixed viewports, reduced motion, finished animations, loaded web fonts, and fixed content with no images. The comparison uses Playwright's default per-pixel tolerance and allows no differing pixels. Three fresh runs matched their baselines exactly, and a one-rule CSS change failed only the screenshot it touched.

`.github/workflows/visual-regression.yml` runs it on pull requests that touch `src/` or the suite, and on `main`. It is not a merge gate yet: the baselines were made on Ubuntu 24.04 outside Actions. Once it is green on the runners, move the job into `ci.yml` under the CI Summary. If the runners render differently, dispatch the workflow with `update`, then review and commit the images it uploads.

When a change is meant to look different, run `AB_VISUAL_UPDATE=1 pnpm ci:visual`, look at every rewritten image, and commit them with the change.

## Aggressive Apparel integration

The independent-site proof shows the plugin needs nothing from the theme. `.github/workflows/aggressive-apparel-integration.yml` checks the other direction: Aggressive Apparel still works with the packaged plugin.

`pnpm ci:integration` (`bin/ci/integration.sh`) takes the ZIP that `pnpm ci:package` builds and a built checkout of the theme's repository (`AB_THEME_DIR`, default `.cache/ci/aggressive-apparel`). It installs WordPress at the primary CI version, then the ZIP, then the WooCommerce release the theme pins in its own `bin/ci/.wp-env.json`, and activates the theme. `tests/integration/` then reads the theme's templates, template parts, and patterns from the running site:

* Every plugin block they use is registered, none uses a removed `aggressive-apparel/*` name, and each one loads valid in the block editor.
* The header and footer parts, the single-product template, and every theme pattern that uses a plugin block render those blocks on the front end, with no script errors. Horizontal Scroll, Animate On Scroll, and Ticker also show that their view scripts ran.
* PHP logs no error, warning, notice, or deprecation from the plugin or the theme.

Coverage follows the theme: a block the theme starts using is checked on the next run without editing the suite.

The lane runs WordPress natively with PHP's built-in server, the way the theme's own CI does, so it needs no Docker. In Actions the database is a MySQL service; locally it is the disposable MySQL that `bin/phpunit.sh` starts from the theme checkout. `bin/ci/lib/native-wp.sh` holds the setup it shares with the WordPress floor lane.

It is not a merge gate. It depends on the theme's default branch and on WordPress.org downloads, and it builds the theme from source, so a theme change can turn it red with no change here. It runs weekly, on manual dispatch (any theme ref), and on pull requests that change the lane itself.

## WordPress VIP standards that CI enforces

PHPCS runs WordPress, WordPress-Core, WordPress-Docs, WordPress-Extra, and WordPress-VIP-Go. Warnings are failures. The plugin text domain is `aggressive-blocks`.

PHPCompatibility 9.x is a Composer dependency but is not enabled as a PHPCS ruleset because it conflicts with WPCS 3 / PHPCS 3.13 (same constraint as Aggressive Apparel). The 8.2 floor is still enforced by Composer, PHPStan, the plugin header, and the PHP 8.2 wp-env lane.

PHPStan runs at level 8 on `aggressive-blocks.php`, `includes/`, and `src/`. There is no giant baseline. The only documented typing exception is WordPress stub optimism (`treatPhpDocTypesAsCertain: false`).

`composer.json` has no `version` field so `composer validate --strict` stays clean. CI sets `COMPOSER_ROOT_VERSION` from the plugin header.

VIP-oriented security, filesystem, and performance contracts live in PHPUnit (`tests/Security`, `tests/Performance`, `tests/Unit/Vip`) plus VIPCS. Production PHP must not write generated files into the plugin directory, call `eval`/`unserialize`, or issue runtime remote HTTP.

## Security

* CodeQL scans authored JS/TS on pull requests, `main`, and a weekly schedule. It does not replace PHP analysis.
* `pnpm audit --prod --audit-level high` is part of `ci:frontend`.
* `composer audit` runs in the PHP lane. Composer has no runtime PHP dependencies; advisories in development tools are informational.
* Dependabot opens grouped minor/patch updates. Majors are not scheduled; security updates still open.
* Workflows pin third-party Actions to commit SHAs. Every checkout uses `persist-credentials: false`; `bin/ci/contracts.mjs` enforces it for every job, including the release job.
* Release ZIPs carry a signed build-provenance attestation. See [SECURITY.md](../SECURITY.md) for how to verify a download.
* Write-capable `pull_request_target` jobs check out the protected base SHA only.

## Release

Merging to `main` does not publish. A release is an explicit `workflow_dispatch` with `publish: true` on `main`. The release job runs only after every lane (frontend, i18n, build, PHP, E2E, package verification and artifact acceptance) succeeds.

The release tags the commit the run tested, attests the ZIP, and publishes the conventional-commit notes that release planning generated (Features, Bug Fixes, and any breaking changes).

Recovery procedure: `.github/workflows/release-recovery.yml` with the tag to rebuild. It rebuilds from the tag, re-runs package verification and artifact acceptance, refuses to replace a published asset with different bytes, then re-attaches the ZIP.

## Scheduled informational workflows

| Workflow | Cadence | Blocks merge? |
| --- | --- | --- |
| WordPress Beta/RC | Wednesdays | No |
| Aggressive Apparel integration | Thursdays | No |
| Visual regression | Pull requests touching `src/` or the suite, and `main` | Not yet (see above) |
| PHP 8.3 / 8.4 forward | Mondays | No |
| CodeQL baseline | Mondays | Alerts via code scanning |
| Workflow security | Mondays | Same Actionlint/Zizmor checks |
| Ruleset drift | Mondays | No; fails if live rules diverge |
| Release recovery rehearsal | Tuesdays | No; fails if the latest release no longer rebuilds byte for byte |

## Single-maintainer controls

The repository has one maintainer, so no pull request gets a second human review. The ruleset requires no approvals because an author cannot approve their own pull request. That gap is real; these controls narrow it rather than close it:

* Nothing reaches `main` without a pull request, the required checks, signed commits, and linear history.
* Checks test outcomes, not only their own output. The POT must cover every translated script, stylesheets must style migrated blocks, packaging must reproduce the published bytes, and Jest coverage cannot fall below its floor.
* Publishing is a separate, deliberate act: a manual dispatch through the `production` environment, never a side effect of merging.

## Failure policy

Do not make a failing check green by disabling it, lowering severity, adding a broad ignore, swallowing exit codes, or marking a required job `continue-on-error`. Fix the defect. Only the scheduled forward-compatibility workflows are non-blocking.
