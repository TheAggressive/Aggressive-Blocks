#!/usr/bin/env bash

# Canonical required-release browser lane with clean, isolated WordPress state.
# The mapped plugin is the source checkout; the artifact lane proves the ZIP.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# CI splits the suite across parallel jobs. Each shard gets its own WordPress,
# so one worker per shard keeps the isolation the suite relies on.
playwright_args=()
if [[ -n "${AA_E2E_SHARD:-}" ]]; then
	if [[ ! "${AA_E2E_SHARD}" =~ ^[1-9][0-9]*/[1-9][0-9]*$ ]]; then
		echo "AA_E2E_SHARD must look like 1/2, got: ${AA_E2E_SHARD}" >&2
		exit 2
	fi
	playwright_args+=("--shard=${AA_E2E_SHARD}")
fi

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
	playwright test ${playwright_args[@]+"${playwright_args[@]}"}
