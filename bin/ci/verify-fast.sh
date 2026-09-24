#!/usr/bin/env bash

# Fast pre-push subset of the required CI lanes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

pnpm ci:doctor
pnpm ci:frontend
pnpm ci:i18n

echo "Fast local CI gate passed."
