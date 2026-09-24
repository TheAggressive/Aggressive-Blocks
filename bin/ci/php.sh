#!/usr/bin/env bash

# Canonical PHP quality and test lane. Local parity and Actions execute
# these commands inside the PHP 8.2 container from bin/ci/.wp-env.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLUGIN_CWD="wp-content/plugins/aggressive-blocks"

bash "${SCRIPT_DIR}/install-composer.sh"
mkdir -p "${REPO_ROOT}/.cache/ci"
WP_CLI_INSTALL_PATH="${REPO_ROOT}/.cache/ci/wp" \
	WP_CLI_SKIP_INFO=1 \
	bash "${SCRIPT_DIR}/install-wp-cli.sh"

cleanup() {
	if ! bash "${SCRIPT_DIR}/stop-wp-env.sh"; then
		echo "Warning: CI parity containers could not be stopped." >&2
	fi
}
trap cleanup EXIT

AA_CI_XDEBUG_MODE=coverage bash "${SCRIPT_DIR}/reset-wp-env.sh"

COMPOSER_ROOT_VERSION="$(
	sed -n 's/^ \* Version:[[:space:]]*\([^[:space:]]*\).*$/\1/p' "${REPO_ROOT}/aggressive-blocks.php" | head -n 1
)"

ci_php() {
	bash "${SCRIPT_DIR}/wp-env.sh" run tests-cli \
		--env-cwd="${PLUGIN_CWD}" \
		-- bash -c "COMPOSER_ROOT_VERSION=\"${COMPOSER_ROOT_VERSION}\" PATH=\"\$PWD/bin/ci:\$PATH\" $1"
}

ci_php 'XDEBUG_MODE=off composer validate --strict --no-interaction'
ci_php 'XDEBUG_MODE=off composer install --no-interaction --prefer-dist --no-progress'
ci_php 'XDEBUG_MODE=off find aggressive-blocks.php includes src -name "*.php" -exec php -l {} \; >/dev/null && echo "PHP syntax valid"'
ci_php 'XDEBUG_MODE=off composer lint:php'
ci_php 'XDEBUG_MODE=off ./vendor/bin/phpstan analyse --memory-limit=2G --verbose'
ci_php 'XDEBUG_MODE=coverage ./vendor/bin/phpunit --testsuite=unit --coverage-clover=coverage-unit.xml.tmp && test -s coverage-unit.xml.tmp && mv coverage-unit.xml.tmp coverage-unit.xml'

ci_php 'bash bin/i18n/compile.sh'

ci_php 'XDEBUG_MODE=off ./vendor/bin/phpunit --testsuite=integration --verbose'
ci_php 'XDEBUG_MODE=off ./vendor/bin/phpunit --testsuite=security --verbose'
ci_php 'XDEBUG_MODE=off ./vendor/bin/phpunit --testsuite=accessibility --verbose'
ci_php 'XDEBUG_MODE=off ./vendor/bin/phpunit --testsuite=performance --verbose'

if ! ci_php 'XDEBUG_MODE=off composer audit'; then
	echo "Composer reported a development-tool advisory (informational)." >&2
fi
