#!/usr/bin/env bash
#
# Canonical release-packaging lane.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TOOL_DIR="${REPO_ROOT}/.cache/ci"
WP_CLI_PATH="${TOOL_DIR}/wp"
PLUGIN_CWD="wp-content/plugins/aggressive-blocks"

mkdir -p "${TOOL_DIR}"
WP_CLI_INSTALL_PATH="${WP_CLI_PATH}" \
	WP_CLI_SKIP_INFO=1 \
	bash "${SCRIPT_DIR}/install-wp-cli.sh"

cleanup() {
	if ! bash "${SCRIPT_DIR}/stop-wp-env.sh"; then
		echo "Warning: CI parity containers could not be stopped." >&2
	fi
}
trap cleanup EXIT

bash "${SCRIPT_DIR}/reset-wp-env.sh"

bash "${SCRIPT_DIR}/wp-env.sh" run cli \
	--env-cwd="${PLUGIN_CWD}" \
	-- bash -c 'PATH="$PWD/bin/ci:$PATH" bash bin/i18n/compile.sh'

cd "${REPO_ROOT}"
release_version="${AA_RELEASE_VERSION:-}"
if [[ -n "${release_version}" ]]; then
	package_name="aggressive-blocks-${release_version}.zip"
else
	package_name="aggressive-blocks.zip"
fi

bash bin/release/package.sh "${release_version}"
bash bin/release/verify-package.sh "${package_name}" "${release_version}"

first_digest="$(sha256sum "${package_name}" | awk '{print $1}')"
bash bin/release/package.sh "${release_version}"
second_digest="$(sha256sum "${package_name}" | awk '{print $1}')"
if [[ "${first_digest}" != "${second_digest}" ]]; then
	echo "Package is not reproducible: ${first_digest} != ${second_digest}" >&2
	exit 1
fi

bash bin/release/verify-package.sh "${package_name}" "${release_version}"

if [[ -n "${release_version}" ]]; then
	sha256sum "${package_name}" >"${package_name}.sha256"
	sha256sum --check "${package_name}.sha256"
fi
