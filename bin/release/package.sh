#!/usr/bin/env bash
#
# Build the distributable plugin ZIP from the allowlist in bin/release/lib.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

VERSION="${1:-}"
if [[ -n "${VERSION}" && ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
	echo "Invalid release version '${VERSION}'." >&2
	exit 2
fi

if [[ -n "${VERSION}" ]]; then
	OUT_NAME="${AA_PLUGIN_SLUG}-${VERSION}.zip"
else
	OUT_NAME="${AA_PLUGIN_SLUG}.zip"
fi
OUT_ZIP="${REPO_ROOT}/${OUT_NAME}"

if [[ ! -d "${REPO_ROOT}/build" ]]; then
	echo "build/ is missing. Run: pnpm ci:build" >&2
	exit 1
fi

missing_inputs=0
for entry in "${AA_PACKAGE_INCLUDE[@]}"; do
	if [[ ! -e "${REPO_ROOT}/${entry}" ]]; then
		echo "Allowlisted path '${entry}' does not exist." >&2
		missing_inputs=1
	fi
done
if [[ "${missing_inputs}" -ne 0 ]]; then
	exit 1
fi

STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ab-package.XXXXXX")"
cleanup() {
	rm -rf "${STAGE_ROOT}"
}
trap cleanup EXIT

PLUGIN_DIR="${STAGE_ROOT}/${AA_PLUGIN_SLUG}"
mkdir -p "${PLUGIN_DIR}"

for entry in "${AA_PACKAGE_INCLUDE[@]}"; do
	cp -a "${REPO_ROOT}/${entry}" "${PLUGIN_DIR}/"
done

for prune in "${AA_PACKAGE_PRUNE[@]}"; do
	if [[ -e "${PLUGIN_DIR}/${prune}" ]]; then
		rm -rf "${PLUGIN_DIR:?}/${prune}"
	fi
done

while IFS= read -r -d '' tests_dir; do
	rm -rf "${tests_dir}"
done < <(find "${PLUGIN_DIR}" -type d -name '__tests__' -print0)

find "${PLUGIN_DIR}" \
	\( -name '.gitignore' -o -name '.gitattributes' -o -name '.DS_Store' \
		-o -name 'Thumbs.db' -o -name '*.map' \) -delete

if [[ -n "${VERSION}" ]]; then
	STAGED_PLUGIN="${PLUGIN_DIR}/aggressive-blocks.php"
	sed -i "s/^ \* Version:[[:space:]].*$/ * Version:           ${VERSION}/" "${STAGED_PLUGIN}"
	sed -i "s/define( 'AGGRESSIVE_BLOCKS_VERSION', '[^']*' );/define( 'AGGRESSIVE_BLOCKS_VERSION', '${VERSION}' );/" "${STAGED_PLUGIN}"
	staged_version="$(aa_plugin_header_version "${STAGED_PLUGIN}")"
	if [[ "${staged_version}" != "${VERSION}" ]]; then
		echo "Version stamp did not apply to staged plugin header." >&2
		exit 1
	fi
fi

SOURCE_EPOCH="${SOURCE_DATE_EPOCH:-}"
if [[ -z "${SOURCE_EPOCH}" ]]; then
	if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		SOURCE_EPOCH="$(git log -1 --format=%ct)"
	else
		SOURCE_EPOCH=1704067200
	fi
fi
if [[ ! "${SOURCE_EPOCH}" =~ ^[0-9]+$ || "${SOURCE_EPOCH}" -lt 315532800 ]]; then
	echo "SOURCE_DATE_EPOCH must be a Unix timestamp supported by ZIP." >&2
	exit 2
fi

find "${PLUGIN_DIR}" -type d -exec chmod 0755 {} +
find "${PLUGIN_DIR}" -type f -exec chmod 0644 {} +
find "${PLUGIN_DIR}" -exec touch -h -d "@${SOURCE_EPOCH}" {} +

rm -f "${OUT_ZIP}"
(
	cd "${STAGE_ROOT}"
	TZ=UTC find "${AA_PLUGIN_SLUG}" -print |
		LC_ALL=C sort |
		TZ=UTC zip -qX "${OUT_ZIP}" -@
)

echo "Package created: ${OUT_ZIP}"
