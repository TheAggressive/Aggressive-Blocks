#!/usr/bin/env bash

# Screenshot regression for a few canonical block states. Baselines only mean
# something in the environment that made them, so this lane pins it: the
# packaged ZIP on the primary CI WordPress with Twenty Twenty-Five, served
# natively, in the Playwright Chromium on Ubuntu 24.04. The Studio and wp-env
# lanes never run tests/visual.
#
# AB_VISUAL_UPDATE=1 rewrites the baselines instead of comparing against them.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"
release_version="${AA_RELEASE_VERSION:-}"
PACKAGE_PATH="${REPO_ROOT}/aggressive-blocks${release_version:+-${release_version}}.zip"
cd "${REPO_ROOT}"

# shellcheck source=bin/ci/lib/native-wp.sh
source "${SCRIPT_DIR}/lib/native-wp.sh"

if [[ ! -f "${PACKAGE_PATH}" ]]; then
	echo "Expected $(basename "${PACKAGE_PATH}") in the repository root (pnpm ci:package)." >&2
	exit 1
fi

wp_version="$(node -p 'require("./bin/ci/artifact/.wp-env.json").core.match(/wordpress-(.+)\.zip$/)[1]')"

native_wp_init visual "${wp_version}" "${AB_VISUAL_PORT:-9980}"
trap native_wp_cleanup EXIT
native_wp_install "${PACKAGE_PATH}"
"${NATIVE_WP}" theme activate twentytwentyfive
native_wp_serve

playwright_args=()
if [[ "${AB_VISUAL_UPDATE:-}" == 1 ]]; then
	playwright_args+=(--update-snapshots)
fi

CI=1 \
	WP_BASE_URL="${NATIVE_BASE_URL}" \
	playwright test --config playwright.visual.config.ts \
	${playwright_args[@]+"${playwright_args[@]}"} "$@"

native_wp_assert_clean_log "${NATIVE_WP_DIR}/wp-content/plugins/aggressive-blocks/"
