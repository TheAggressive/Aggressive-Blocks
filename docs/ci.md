# CI/CD and quality gates

Aggressive Blocks is developed and tested against WordPress VIP Coding Standards. That is demonstrated by automated checks, not by a certification claim.

This document is the contract between local development, GitHub Actions, and the protected `main` branch.

## Supported versions

| Surface | Version | Enforced by |
| --- | --- | --- |
| PHP floor | 8.2 | plugin header, `composer.json`, `phpstan.neon`, `bin/ci/.wp-env.json` |
| WordPress floor | 7.0+ | plugin header |
| Primary CI WordPress | 7.1.2 | `bin/ci/.wp-env.json` |
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
4. Canonical production build (`pnpm ci:build`)
5. PHP lane (`pnpm ci:php`) against the same build artifact
6. Playwright E2E against WordPress + this plugin + Twenty Twenty-Five
7. Allowlist ZIP (`pnpm ci:package`)
8. Artifact acceptance: install that ZIP and re-run E2E (`pnpm ci:artifact`)

Lanes wait only for the inputs they use. After classification, the frontend, i18n and build lanes start together. Once the build is uploaded, PHP, E2E and packaging start together, and artifact acceptance follows packaging. Nothing is dropped by running in parallel: the summary job and the release job each require every lane to pass.

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
| PHPUnit only | `pnpm test:php` |
| Tool/contract tests | `pnpm test:tools` |

Day-to-day development uses WordPress Studio. `pnpm qa:fast` is the local pre-push check and does not start containers. `pnpm qa` rehearses the containerized CI lanes: it routes through the same pinned Node as Actions (`bin/ci/node.sh`) and then `bin/ci/verify.sh`.

`pnpm test:e2e:studio` runs the Playwright suite against the Studio site that serves this checkout, with no Docker. `bin/local/studio-e2e.sh` finds the site, logs in with Studio's auto-login URL, and for the length of the run switches to Twenty Twenty-Five and hides the admin bar. It records both first and restores them afterwards, even after a killed run. The site must opt in once with `touch <site>/.aggressive-blocks-e2e-site`. It runs other plugins and its own theme, so a local pass is a fast signal; the wp-env lane in CI remains the release proof.

## Independent-site proof

`bin/ci/.wp-env.json` maps only this plugin. E2E activates Twenty Twenty-Five. Aggressive Apparel and WooCommerce are not installed.

Artifact acceptance installs the generated ZIP into a second wp-env that does **not** map plugin source. A green artifact lane means the packaged plugin works without the source checkout or the source theme.

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
