#!/usr/bin/env bash
#
# Assert the plugin ZIP contains every runtime file and no development material.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

PACKAGE="${1:?Usage: verify-package.sh <zip> [version]}"
VERSION="${2:-}"

if [[ ! -f "${PACKAGE}" ]]; then
	echo "Package not found: ${PACKAGE}" >&2
	exit 1
fi

LIST="$(unzip -Z1 "${PACKAGE}")"

fail=0
for required in "${AA_PACKAGE_REQUIRED[@]}"; do
	if ! grep -qx "${AA_PLUGIN_SLUG}/${required}" <<<"${LIST}"; then
		echo "Missing required path: ${AA_PLUGIN_SLUG}/${required}" >&2
		fail=1
	fi
done

for forbidden in "${AA_PACKAGE_FORBIDDEN[@]}"; do
	if grep -q "${forbidden}" <<<"${LIST}"; then
		echo "Forbidden path present: ${forbidden}" >&2
		fail=1
	fi
done

if grep -E '(^|/)(src|node_modules|vendor|tests|coverage)/' <<<"${LIST}" >/dev/null; then
	echo "Package contains development directories." >&2
	fail=1
fi

if ! header="$(unzip -p "${PACKAGE}" "${AA_PLUGIN_SLUG}/aggressive-blocks.php" 2>/dev/null)"; then
	echo "Missing required path: ${AA_PLUGIN_SLUG}/aggressive-blocks.php" >&2
	fail=1
else
	if ! grep -q "Text Domain:       aggressive-blocks" <<<"${header}"; then
		echo "Plugin text domain is not aggressive-blocks." >&2
		fail=1
	fi

	packaged_version="$(aa_plugin_header_version <(printf '%s\n' "${header}"))"
	if [[ -n "${VERSION}" && "${packaged_version}" != "${VERSION}" ]]; then
		echo "Packaged version ${packaged_version} does not match ${VERSION}." >&2
		fail=1
	fi

	# WordPress reads the header, the code reads the constant, and readers (and
	# WordPress.org) read the Stable tag: all three must name the same release.
	expected="${VERSION:-${packaged_version}}"
	constant_version="$(aa_plugin_constant_version <(printf '%s\n' "${header}"))"
	if [[ "${constant_version}" != "${expected}" ]]; then
		echo "AGGRESSIVE_BLOCKS_VERSION ${constant_version:-(missing)} does not match ${expected}." >&2
		fail=1
	fi

	if readme="$(unzip -p "${PACKAGE}" "${AA_PLUGIN_SLUG}/readme.txt" 2>/dev/null)"; then
		stable_tag="$(aa_readme_stable_tag <(printf '%s\n' "${readme}"))"
		if [[ "${stable_tag}" != "${expected}" ]]; then
			echo "readme.txt Stable tag ${stable_tag:-(missing)} does not match ${expected}." >&2
			fail=1
		fi
	fi
fi

if [[ "${fail}" -ne 0 ]]; then
	exit 1
fi

echo "Package verified: ${PACKAGE}"
