#!/usr/bin/env bash

# Install and exercise the distributable ZIP in WordPress with no source mapping
# and no Aggressive Apparel theme. Twenty Twenty-Five is the default block theme.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/artifact"
WP_ENV_EXECUTABLE="${REPO_ROOT}/node_modules/.bin/wp-env"
PLAYWRIGHT_EXECUTABLE="${REPO_ROOT}/node_modules/.bin/playwright"
ARTIFACT_HOME="${REPO_ROOT}/.cache/ci/wp-env-artifact"
ARTIFACT_FILES="${REPO_ROOT}/.cache/ci/artifact-files"
release_version="${AA_RELEASE_VERSION:-}"

if [[ -n "${release_version}" ]]; then
	package_name="aggressive-blocks-${release_version}.zip"
else
	package_name="aggressive-blocks.zip"
fi
package_path="${REPO_ROOT}/${package_name}"

if [[ ! -f "${package_path}" ]]; then
	echo "Artifact acceptance expected ${package_name} in the repository root." >&2
	exit 1
fi

if [[ ! -x "${WP_ENV_EXECUTABLE}" || ! -x "${PLAYWRIGHT_EXECUTABLE}" ]]; then
	echo "wp-env or Playwright is not installed. Run pnpm install --frozen-lockfile." >&2
	exit 1
fi

expected_version="$({
	unzip -p "${package_path}" aggressive-blocks/aggressive-blocks.php
} | sed -n 's/^ \* Version:[[:space:]]*\([^[:space:]]*\).*$/\1/p' | head -n 1)"
if [[ -z "${expected_version}" ]]; then
	echo "Could not read the packaged plugin version." >&2
	exit 1
fi
if [[ -n "${release_version}" && "${expected_version}" != "${release_version}" ]]; then
	echo "Packaged version ${expected_version} does not match ${release_version}." >&2
	exit 1
fi

mkdir -p "${ARTIFACT_FILES}"
find "${ARTIFACT_FILES}" -mindepth 1 -maxdepth 1 -type f -name '*.zip' -delete
cp "${package_path}" "${ARTIFACT_FILES}/${package_name}"

artifact_wp_env() {
	(
		cd "${CONFIG_DIR}"
		WP_ENV_HOME="${ARTIFACT_HOME}" CI=true "${WP_ENV_EXECUTABLE}" "$@"
	)
}

cleanup() {
	if ! artifact_wp_env stop; then
		echo "Warning: artifact-acceptance containers could not be stopped." >&2
	fi
}
trap cleanup EXIT

artifact_wp_env start
artifact_wp_env clean all --no-scripts
artifact_wp_env run cli wp plugin install \
	"/var/www/html/wp-content/ab-artifacts/${package_name}" --activate --force
artifact_wp_env run cli wp theme activate twentytwentyfive
artifact_wp_env run cli wp user meta update admin show_admin_bar_front false

actual_version="$(artifact_wp_env run cli wp plugin get aggressive-blocks --field=version | tail -n 1)"
if [[ "${actual_version}" != "${expected_version}" ]]; then
	echo "Installed version ${actual_version} does not match ${expected_version}." >&2
	exit 1
fi

active_theme="$(artifact_wp_env run cli wp theme get twentytwentyfive --field=status | tail -n 1)"
if [[ "${active_theme}" != "active" ]]; then
	echo "Expected Twenty Twenty-Five to be active for independent-site proof." >&2
	exit 1
fi

cd "${REPO_ROOT}"
CI=1 \
	WP_BASE_URL=http://localhost:9940 \
	WP_ENV_CONFIG_DIR=bin/ci/artifact \
	playwright test
