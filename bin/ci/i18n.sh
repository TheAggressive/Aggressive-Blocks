#!/usr/bin/env bash

# Run the i18n gate with the same pinned WP-CLI release locally and in Actions.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TOOL_DIR="${REPO_ROOT}/.cache/ci"
WP_CLI_PATH="${TOOL_DIR}/wp"

mkdir -p "${TOOL_DIR}"
WP_CLI_INSTALL_PATH="${WP_CLI_PATH}" \
	WP_CLI_SKIP_INFO=1 \
	bash "${SCRIPT_DIR}/install-wp-cli.sh"

if ! command -v msgfmt > /dev/null 2>&1; then
	if command -v apt-get > /dev/null 2>&1 && sudo -n true > /dev/null 2>&1; then
		echo "msgfmt not found — installing gettext for catalog validation."
		if ! { sudo -n apt-get update -qq && sudo -n apt-get install -y -qq gettext; }; then
			echo "Warning: installing gettext failed." >&2
		fi
	else
		echo "Warning: msgfmt is missing and cannot be installed automatically." >&2
	fi
fi

cleanup() {
	if ! bash "${SCRIPT_DIR}/stop-wp-env.sh"; then
		echo "Warning: CI parity containers could not be stopped." >&2
	fi
}
trap cleanup EXIT

bash "${SCRIPT_DIR}/reset-wp-env.sh"

bash "${SCRIPT_DIR}/wp-env.sh" run cli \
	--env-cwd="wp-content/plugins/aggressive-blocks" \
	-- bash -c 'PATH="$PWD/bin/ci:$PATH" I18N_CI=1 AA_I18N_PO_VALIDATOR=skip bash bin/i18n/check.sh'

bash "${REPO_ROOT}/bin/i18n/validate-po.sh"
