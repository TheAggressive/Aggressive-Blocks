# Plugin updates

Aggressive Blocks updates itself from this repository's GitHub releases. The update appears in wp-admin, installs, and follows auto-update settings like any other plugin. `includes/Update/` holds the code; this document is its contract.

## How it works

The plugin header declares `Update URI: https://github.com/TheAggressive/Aggressive-Blocks`. WordPress (5.8+) then leaves the plugin out of its WordPress.org update request, so a WordPress.org plugin with the same slug can never be installed over it. Instead, WordPress asks the `update_plugins_github.com` filter, and `Plugin_Updates::update()` answers:

1. `Release_Repository` reads the repository's releases from the GitHub API and picks the highest `vX.Y.Z` tag that is neither a draft nor a prerelease.
2. If that release is newer than the installed version, it offers the release's exact asset, `aggressive-blocks-X.Y.Z.zip`. It does so only when the release also has `aggressive-blocks-X.Y.Z.zip.sha256`. A release without its checksum is never offered.
3. It adds the WordPress and PHP versions the release requires, and the WordPress version it was tested with, all read from that release's `readme.txt`. WordPress uses them to mark an incompatible update and to skip it during auto-updates. If the readme can't be read, the update is still offered without them. WordPress refuses an incompatible package when installing anyway, because it checks the package's own header.

WordPress core does everything else: the update notice, "Update now", auto-updates, maintenance mode, and replacing the files. "View details" shows the release's notes, as escaped text.

## What is trusted

* **Asset URLs.** Only `https://github.com/TheAggressive/Aggressive-Blocks/releases/download/vX.Y.Z/aggressive-blocks-X.Y.Z.zip`, with the file named for its own tag. Any other host, scheme, port, credentials, query, fragment, dot segment, repository, or version mismatch is rejected.
* **Integrity.** Before WordPress unpacks a package for this plugin, `Package_Verifier` hashes the exact file about to be installed and compares it with the release's SHA-256 checksum. That covers a file it downloaded itself and one an earlier `upgrader_pre_download` callback supplied, such as WP-CLI's download cache. It runs last on that filter, so nothing can replace the file after it is checked. A missing checksum or a mismatch aborts the update, deletes the download, and leaves the installed plugin untouched.
* **Scope of the checksum.** The checksum proves the package is the one the release published. It does not prove who published it: anyone who could publish a release could publish a matching checksum. For that, every release ZIP also carries a signed build-provenance attestation. Verify it with `gh attestation verify` (see [SECURITY.md](../SECURITY.md)) before approving a new version on a fleet.

## Network use

The updater is the plugin's only outbound HTTP. `tests/Performance/Runtime_Budget_Test.php` enforces that remote calls exist only in `Update_Http_Client` and the package download. The updater requests:

| Request | When | Limit |
| --- | --- | --- |
| `api.github.com/repos/…/releases?per_page=20` | WordPress's update checks (cron twice a day, and some admin screens) | cached network-wide for 5 minutes |
| `raw.githubusercontent.com/…/vX.Y.Z/readme.txt` | once per newer release | cached for a day (5 minutes if unreadable) |
| `…/aggressive-blocks-X.Y.Z.zip.sha256` | once per newer release | cached for a day |
| `…/aggressive-blocks-X.Y.Z.zip` | when an update is installed | none |

Each request goes through `wp_safe_remote_get()` with a 3-second timeout, three redirects, and a response size cap. A failed lookup, including a GitHub outage or a rate limit, is cached for the same 5-minute window, and the last good release keeps being offered. A visitor's page request never triggers a call.

## When it is off

`Plugin_Updates::is_enabled()` registers no hooks at all (no lookups, no offer, no package verification) when any of these is true:

* **The plugin is a git checkout.** `.git` exists in the plugin directory. Installing a release deletes the directory's contents, including uncommitted work and history.
* **The environment type is `local` or `development`.** Set `WP_ENVIRONMENT_TYPE` accordingly.
* **WordPress may not modify files.** `DISALLOW_FILE_MODS`, as on WordPress VIP and hosts that deploy code from git. No update could be installed there, so the plugin makes no remote requests at all.

The `aggressive_blocks_enable_updates` filter has the last word. It receives the computed result and the three signals. Return `false` to keep the updater off, for example on a fleet that rolls out releases through its own pipeline.

## How it is tested

* `tests/Integration/Plugin_Updates_Test.php` runs against WordPress's HTTP API with GitHub mocked. It covers:
  - offering a release and its requirements, and reporting a current install without a package;
  - withholding a release that has no checksum;
  - stable selection, with drafts, prereleases and malformed tags ignored;
  - rejected URLs;
  - failure back-off with a fallback to the last good release;
  - leaving other `github.com` plugins alone;
  - verifying good, tampered, and cache-supplied packages;
  - escaped release notes and cache clearing.
* `tests/Integration/Updater_Guard_Test.php` checks the enablement policy for every combination of signals. It also checks that a checkout registers no hooks, and that the header declares the `Update URI`.
* `bin/ci/update-smoke.sh` runs in CI after every release (the `update-smoke` job), against the real GitHub release. It installs the released code as version 0.0.1 on a clean site and requires three outcomes:
  - WordPress offers the new release with its exact package and requirements, and updating installs it;
  - served a wrong checksum, the update is refused;
  - given a poisoned WP-CLI download cache, it is refused too.

  Run it locally with `AA_RELEASE_VERSION=X.Y.Z pnpm ci:update-smoke`.
