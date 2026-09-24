#!/usr/bin/env bash

# Canonical required-release browser lane with clean, isolated WordPress state.
# The mapped plugin is the source checkout; the artifact lane proves the ZIP.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cleanup() {
	if ! bash "${SCRIPT_DIR}/stop-wp-env.sh"; then
		echo "Warning: CI parity containers could not be stopped." >&2
	fi
}
trap cleanup EXIT

bash "${SCRIPT_DIR}/reset-wp-env.sh"

bash "${SCRIPT_DIR}/wp-env.sh" run cli wp plugin activate aggressive-blocks
bash "${SCRIPT_DIR}/wp-env.sh" run cli wp theme activate twentytwentyfive
bash "${SCRIPT_DIR}/wp-env.sh" run cli wp user meta update admin show_admin_bar_front false

cd "${REPO_ROOT}"
CI=1 \
	WP_BASE_URL=http://localhost:9930 \
	WP_ENV_CONFIG_DIR=bin/ci \
	playwright test
