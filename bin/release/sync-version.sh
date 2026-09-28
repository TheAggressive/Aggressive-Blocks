#!/usr/bin/env bash
#
# Write a released version into the tracked plugin files.
#
# bin/release/package.sh stamps the version into the staged ZIP only, so the
# checkout never learns what shipped. The release workflow runs this afterwards
# and opens a pull request with the result. That keeps the plugin header, the
# AGGRESSIVE_BLOCKS_VERSION constant, and the readme's Stable tag on main equal
# to the latest release. A self-updating install compares against those, and
# every asset version derived from the constant does too.
#
# Idempotent: with the version already in place it exits 0 having written
# nothing, so the workflow can call it unconditionally.
#
# Usage:
#   bash bin/release/sync-version.sh 1.2.3
#   AA_RELEASE_VERSION=1.2.3 bash bin/release/sync-version.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${AA_SYNC_ROOT:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

VERSION="${1:-${AA_RELEASE_VERSION:-}}"

if [[ -z "${VERSION}" ]]; then
	echo "A version is required: bin/release/sync-version.sh <version>" >&2
	exit 2
fi

# The value reaches sed replacements and committed files, so anything but a
# bare release version fails here instead of being written.
if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "Not a bare semantic version: '${VERSION}' (expected e.g. 1.2.3)." >&2
	exit 2
fi

plugin="${REPO_ROOT}/aggressive-blocks.php"
readme="${REPO_ROOT}/readme.txt"
current="$(aa_plugin_header_version "${plugin}")"

if [[ "${current}" == "${VERSION}" &&
	"$(aa_plugin_constant_version "${plugin}")" == "${VERSION}" &&
	"$(aa_readme_stable_tag "${readme}")" == "${VERSION}" ]]; then
	echo "The plugin already declares ${VERSION}; nothing to sync."
	exit 0
fi

aa_stamp_version "${REPO_ROOT}" "${VERSION}"
echo "Plugin version: ${current:-(none)} → ${VERSION}"
