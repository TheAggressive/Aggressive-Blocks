#!/usr/bin/env bash

# Fast pre-push subset. Does not start wp-env; the merge rehearsal (`pnpm qa`)
# still runs the containerized i18n/php/e2e/package lanes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

pnpm ci:doctor
pnpm ci:frontend
pnpm i18n:check

echo "Fast local CI gate passed."
