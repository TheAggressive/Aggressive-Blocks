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
fi

if [[ "${fail}" -ne 0 ]]; then
	exit 1
fi

echo "Package verified: ${PACKAGE}"
